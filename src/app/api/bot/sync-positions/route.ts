import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botPositions, positionHistory, botActions, botSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from 'crypto';

/**
 * Synchronize bot positions with exchange (OKX ONLY)
 * Checks if positions marked as "open" in DB are still open on the exchange
 * If closed on exchange, updates DB and moves to history
 */

// ============================================
// 🔐 OKX SIGNATURE HELPER
// ============================================

function createOkxSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('base64');
}

// ============================================
// 🔄 SYMBOL CONVERSION FOR OKX
// ============================================

function convertSymbolToOkx(symbol: string): string {
  if (symbol.includes('-')) {
    return symbol;
  }
  
  const match = symbol.match(/^([A-Z0-9]+)(USDT|USD)$/i);
  if (match) {
    const [, base, quote] = match;
    return `${base.toUpperCase()}-${quote.toUpperCase()}-SWAP`;
  }
  
  return symbol;
}

// ============================================
// 🏦 GET OPEN POSITIONS FROM OKX
// ============================================

async function getOkxPositions(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/positions";
  const queryString = "?instType=SWAP";
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
  const baseUrl = "https://www.okx.com";
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }
  
  const response = await fetch(`${baseUrl}${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0") {
    throw new Error(`OKX API error: ${data.msg}`);
  }

  // Return only positions with pos !== 0
  return data.data?.filter((p: any) => parseFloat(p.pos) !== 0) || [];
}

export async function POST(request: NextRequest) {
  try {
    // Get bot settings for API credentials
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret || !settings[0].passphrase) {
      return NextResponse.json({
        success: false,
        message: "OKX API credentials not configured in bot settings",
      }, { status: 400 });
    }

    const botConfig = settings[0];
    const apiKey = botConfig.apiKey!;
    const apiSecret = botConfig.apiSecret!;
    const passphrase = botConfig.passphrase!;
    const environment = botConfig.environment || "demo";
    const demo = environment === "demo";

    console.log(`[Sync] Using OKX (${environment}) - API Key: ${apiKey.substring(0, 8)}...`);

    // Get all open positions from database
    const dbPositions = await db
      .select()
      .from(botPositions)
      .where(eq(botPositions.status, "open"));

    console.log(`[Sync] Found ${dbPositions.length} open positions in database`);

    // Get all open positions from OKX
    let okxPositions;
    try {
      okxPositions = await getOkxPositions(apiKey, apiSecret, passphrase, demo);
      console.log(`[Sync] Found ${okxPositions.length} open positions on OKX`);
    } catch (error) {
      console.error("[Sync] Failed to fetch OKX positions:", error);
      return NextResponse.json({
        success: false,
        message: `Failed to fetch OKX positions: ${error instanceof Error ? error.message : "Unknown error"}`,
      }, { status: 500 });
    }

    // Create a map of OKX positions for quick lookup
    // Key format: "SYMBOL_SIDE" e.g., "XRP-USDT-SWAP_long" or "XRP-USDT-SWAP_short"
    const okxPositionsMap = new Map(
      okxPositions.map((p: any) => {
        const positionSide = parseFloat(p.pos) > 0 ? "long" : "short";
        return [`${p.instId}_${positionSide}`, p];
      })
    );

    const syncResults = {
      checked: 0,
      closed: 0,
      stillOpen: 0,
      errors: [] as string[],
    };

    // Check each DB position against OKX positions
    for (const dbPos of dbPositions) {
      syncResults.checked++;
      
      const okxSymbol = convertSymbolToOkx(dbPos.symbol);
      const positionSide = dbPos.side === "BUY" ? "long" : "short";
      const posKey = `${okxSymbol}_${positionSide}`;
      const okxPos = okxPositionsMap.get(posKey) as any;

      if (!okxPos) {
        // Position is closed on exchange but still open in DB
        console.log(`[Sync] Position ${dbPos.symbol} ${dbPos.side} is closed on OKX, syncing...`);

        try {
          // Calculate final PnL (use last known values)
          const closedAt = new Date();
          const durationMinutes = Math.floor(
            (closedAt.getTime() - new Date(dbPos.openedAt).getTime()) / 1000 / 60
          );

          // Calculate PnL
          const pnl = dbPos.unrealisedPnl; // Last known PnL
          const pnlPercent = (pnl / dbPos.initialMargin) * 100;

          // Save to position_history
          await db.insert(positionHistory).values({
            positionId: dbPos.id,
            symbol: dbPos.symbol,
            side: dbPos.side,
            tier: dbPos.tier,
            entryPrice: dbPos.entryPrice,
            closePrice: dbPos.entryPrice, // We don't know exact exit price
            quantity: dbPos.quantity,
            leverage: dbPos.leverage,
            pnl,
            pnlPercent,
            closeReason: "auto_sync",
            tp1Hit: dbPos.tp1Hit,
            tp2Hit: dbPos.tp2Hit,
            tp3Hit: dbPos.tp3Hit,
            confirmationCount: dbPos.confirmationCount,
            openedAt: dbPos.openedAt,
            closedAt: closedAt.toISOString(),
            durationMinutes,
          });

          // Update position status to closed
          await db
            .update(botPositions)
            .set({
              status: "closed",
              closedAt: closedAt.toISOString(),
              closeReason: "auto_sync",
            })
            .where(eq(botPositions.id, dbPos.id));

          // Log action
          await db.insert(botActions).values({
            actionType: "position_closed",
            symbol: dbPos.symbol,
            side: dbPos.side,
            reason: "auto_sync",
            details: JSON.stringify({
              message: "Position closed on OKX, synced to database",
              positionId: dbPos.id,
            }),
            success: true,
            createdAt: new Date().toISOString(),
          });

          syncResults.closed++;
          console.log(`[Sync] ✅ Synced position ${dbPos.symbol} ${dbPos.side}`);
        } catch (error) {
          const errorMsg = `Failed to sync ${dbPos.symbol} ${dbPos.side}: ${error instanceof Error ? error.message : "Unknown error"}`;
          console.error(`[Sync] ❌ ${errorMsg}`);
          syncResults.errors.push(errorMsg);
        }
      } else {
        // Position still open on OKX
        syncResults.stillOpen++;

        // Update unrealised PnL from OKX data
        const updatedPnl = parseFloat(okxPos.upl || "0");
        if (Math.abs(updatedPnl - dbPos.unrealisedPnl) > 0.01) {
          await db
            .update(botPositions)
            .set({ 
              unrealisedPnl: updatedPnl,
              lastUpdated: new Date().toISOString(),
            })
            .where(eq(botPositions.id, dbPos.id));
          console.log(`[Sync] Updated PnL for ${dbPos.symbol}: ${updatedPnl}`);
        }
      }
    }

    console.log(`[Sync] Complete: ${syncResults.closed} closed, ${syncResults.stillOpen} still open`);

    return NextResponse.json({
      success: true,
      message: "Position sync completed",
      results: syncResults,
    });
  } catch (error) {
    console.error("[Sync] Error:", error);
    return NextResponse.json({
      success: false,
      message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}