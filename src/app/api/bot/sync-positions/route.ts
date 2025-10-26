import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botPositions, positionHistory, botActions } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Synchronize bot positions with exchange
 * Checks if positions marked as "open" in DB are still open on the exchange
 * If closed on exchange, updates DB and cleans up orders
 */

// Helper function to sign Bybit requests
async function signBybitRequest(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
) {
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const signString = timestamp + apiKey + 5000 + queryString;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(signString);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return hashHex;
}

// Get all open positions from Bybit
async function getExchangePositions() {
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  const environment = process.env.BYBIT_ENVIRONMENT || "demo";

  if (!apiKey || !apiSecret) {
    throw new Error("Bybit API credentials not configured");
  }

  const timestamp = Date.now();
  const params: Record<string, any> = {
    category: "linear",
    settleCoin: "USDT",
  };

  const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);

  const baseUrl =
    environment === "demo"
      ? "https://api-demo.bybit.com"
      : environment === "testnet"
      ? "https://api-testnet.bybit.com"
      : "https://api.bybit.com";

  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const url = `${baseUrl}/v5/position/list?${queryString}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp.toString(),
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": "5000",
    },
  });

  const data = await response.json();

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  // Return only positions with size > 0
  return data.result?.list?.filter((p: any) => parseFloat(p.size) > 0) || [];
}

// Cancel order on Bybit
async function cancelOrder(orderId: string, symbol: string) {
  const apiKey = process.env.BYBIT_API_KEY;
  const apiSecret = process.env.BYBIT_API_SECRET;
  const environment = process.env.BYBIT_ENVIRONMENT || "demo";

  if (!apiKey || !apiSecret) {
    return { success: false, error: "API credentials not configured" };
  }

  const timestamp = Date.now();
  const params: Record<string, any> = {
    category: "linear",
    symbol,
    orderId,
  };

  const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);

  const baseUrl =
    environment === "demo"
      ? "https://api-demo.bybit.com"
      : environment === "testnet"
      ? "https://api-testnet.bybit.com"
      : "https://api.bybit.com";

  const response = await fetch(`${baseUrl}/v5/order/cancel`, {
    method: "POST",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp.toString(),
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": "5000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  return { success: data.retCode === 0, data };
}

export async function POST(request: NextRequest) {
  try {
    // Get all open positions from database
    const dbPositions = await db
      .select()
      .from(botPositions)
      .where(eq(botPositions.status, "open"));

    console.log(`[Sync] Found ${dbPositions.length} open positions in database`);

    // Get all open positions from exchange
    let exchangePositions;
    try {
      exchangePositions = await getExchangePositions();
      console.log(`[Sync] Found ${exchangePositions.length} open positions on exchange`);
    } catch (error) {
      console.error("[Sync] Failed to fetch exchange positions:", error);
      return NextResponse.json(
        {
          success: false,
          message: `Failed to fetch exchange positions: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
        { status: 500 }
      );
    }

    // Create a map of exchange positions for quick lookup
    const exchangePositionsMap = new Map(
      exchangePositions.map((p: any) => [`${p.symbol}_${p.side}`, p])
    );

    const syncResults = {
      checked: 0,
      closed: 0,
      stillOpen: 0,
      errors: [] as string[],
    };

    // Check each DB position against exchange positions
    for (const dbPos of dbPositions) {
      syncResults.checked++;
      const posKey = `${dbPos.symbol}_${dbPos.side === "BUY" ? "Buy" : "Sell"}`;
      const exchangePos = exchangePositionsMap.get(posKey) as any;

      if (!exchangePos) {
        // Position is closed on exchange but still open in DB
        console.log(`[Sync] Position ${dbPos.symbol} ${dbPos.side} is closed on exchange, syncing...`);

        try {
          // 1. Cancel any pending TP2/TP3 orders if they exist
          if (dbPos.tp2OrderId) {
            await cancelOrder(dbPos.tp2OrderId, dbPos.symbol);
            console.log(`[Sync] Cancelled TP2 order ${dbPos.tp2OrderId}`);
          }
          if (dbPos.tp3OrderId) {
            await cancelOrder(dbPos.tp3OrderId, dbPos.symbol);
            console.log(`[Sync] Cancelled TP3 order ${dbPos.tp3OrderId}`);
          }

          // 2. Calculate final PnL (use last known values)
          const closedAt = new Date();
          const durationMinutes = Math.floor(
            (closedAt.getTime() - new Date(dbPos.openedAt).getTime()) / 1000 / 60
          );

          // Calculate PnL
          const pnl = dbPos.unrealisedPnl; // Last known PnL
          const pnlPercent = (pnl / dbPos.initialMargin) * 100;

          // 3. Save to position_history
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

          // 4. Update position status to closed
          await db
            .update(botPositions)
            .set({
              status: "closed",
              closedAt: closedAt.toISOString(),
              closeReason: "auto_sync",
            })
            .where(eq(botPositions.id, dbPos.id));

          // 5. Log action
          await db.insert(botActions).values({
            actionType: "position_closed",
            symbol: dbPos.symbol,
            side: dbPos.side,
            reason: "auto_sync",
            details: JSON.stringify({
              message: "Position closed on exchange, synced to database",
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
        // Position still open on exchange
        syncResults.stillOpen++;

        // Optionally update unrealised PnL from exchange data
        const updatedPnl = parseFloat(exchangePos.unrealisedPnl || "0");
        if (Math.abs(updatedPnl - dbPos.unrealisedPnl) > 0.01) {
          await db
            .update(botPositions)
            .set({ unrealisedPnl: updatedPnl })
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
    return NextResponse.json(
      {
        success: false,
        message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
      { status: 500 }
    );
  }
}