import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botPositions, positionHistory, botActions, botSettings } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { getBybitPositions, getBybitPositionsHistory, convertSymbolToBybit } from '@/lib/bybit-helpers';

/**
 * Synchronize bot positions with exchange (BYBIT ONLY)
 * Checks if positions marked as "open" in DB are still open on the exchange
 * If closed on exchange, updates DB and moves to history
 */

export async function POST(request: NextRequest) {
  try {
    // Get bot settings for API credentials
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json({
        success: false,
        message: "Bybit API credentials not configured in bot settings",
      }, { status: 400 });
    }

    const botConfig = settings[0];
    const apiKey = botConfig.apiKey!;
    const apiSecret = botConfig.apiSecret!;

    console.log(`[Sync] Using Bybit Mainnet - API Key: ${apiKey?.substring(0, 8) ?? 'N/A'}...`);

    // Get all open AND partial_close positions from database
    const dbPositions = await db
      .select()
      .from(botPositions)
      .where(
        or(
          eq(botPositions.status, "open"),
          eq(botPositions.status, "partial_close")
        )
      );

    console.log(`[Sync] Found ${dbPositions.length} open/partial positions in database`);

    // Get all open positions from Bybit
    let bybitPositions;
    try {
      bybitPositions = await getBybitPositions(apiKey, apiSecret);
      console.log(`[Sync] Found ${bybitPositions.length} open positions on Bybit`);
    } catch (error) {
      console.error("[Sync] Failed to fetch Bybit positions:", error);
      return NextResponse.json({
        success: false,
        message: `Failed to fetch Bybit positions: ${error instanceof Error ? error.message : "Unknown error"}`,
      }, { status: 500 });
    }

    // Create a map of Bybit positions for quick lookup
    // Key format: "SYMBOL_SIDE" e.g., "BTCUSDT_Buy" or "BTCUSDT_Sell"
    const bybitPositionsMap = new Map(
      bybitPositions.map((p: any) => {
        return [`${p.symbol}_${p.side}`, p];
      })
    );

    const syncResults = {
      checked: 0,
      closed: 0,
      stillOpen: 0,
      errors: [] as string[],
    };

    // Check each DB position against Bybit positions
    for (const dbPos of dbPositions) {
      syncResults.checked++;
      
      const bybitSymbol = convertSymbolToBybit(dbPos.symbol);
      const posKey = `${bybitSymbol}_${dbPos.side}`;
      const bybitPos = bybitPositionsMap.get(posKey) as any;

      if (!bybitPos) {
        // Position is closed on exchange but still open in DB
        console.log(`[Sync] Position ${dbPos.symbol} ${dbPos.side} is closed on Bybit, syncing...`);

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
              message: "Position closed on Bybit, synced to database",
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
        // Position still open on Bybit
        syncResults.stillOpen++;

        // Update unrealised PnL from Bybit data
        const updatedPnl = parseFloat(bybitPos.unrealisedPnl || "0");
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