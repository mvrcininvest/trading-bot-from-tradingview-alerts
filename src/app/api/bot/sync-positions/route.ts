import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botPositions, positionHistory, botActions, botSettings } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { getBybitPositions, getBybitPositionsHistory, convertSymbolToBybit } from '@/lib/bybit-helpers';

/**
 * Synchronize bot positions with exchange (BYBIT ONLY)
 * Checks if positions marked as "open" in DB are still open on the exchange
 * If closed on exchange, updates DB and moves to history
 * 
 * ✅ ENHANCED: Better close reason detection based on TP flags, PnL, and Bybit history
 */

/**
 * ============================================
 * 🔍 ENHANCED CLOSE REASON DETECTION
 * ============================================
 */
function detectCloseReason(
  dbPos: any,
  closedPnl: number,
  bybitHistoryEntry?: any
): string {
  const pnl = closedPnl;
  
  // 1️⃣ Check TP flags first (most reliable)
  if (dbPos.tp3Hit && dbPos.tp2Hit && dbPos.tp1Hit) {
    return 'tp3_hit'; // All TPs hit = closed at TP3
  }
  
  if (dbPos.tp2Hit && dbPos.tp1Hit && !dbPos.tp3Hit) {
    return 'tp2_hit'; // TP1+TP2 hit but not TP3 = closed at TP2
  }
  
  if (dbPos.tp1Hit && !dbPos.tp2Hit && !dbPos.tp3Hit) {
    return 'tp1_hit'; // Only TP1 hit = closed at TP1
  }
  
  // 2️⃣ Check Bybit history for exec type (if available)
  if (bybitHistoryEntry) {
    const execType = bybitHistoryEntry.execType;
    
    if (execType === 'Trade') {
      // Manual close on exchange
      return 'closed_on_exchange';
    } else if (execType === 'StopOrder' || execType === 'TakeProfit') {
      // Algo order triggered
      if (pnl > 0) {
        // Check which TP level based on flags
        if (dbPos.tp1Hit && !dbPos.tp2Hit) return 'tp1_hit';
        if (dbPos.tp2Hit && !dbPos.tp3Hit) return 'tp2_hit';
        if (dbPos.tp3Hit) return 'tp3_hit';
        return 'tp_main_hit'; // Generic TP
      } else if (pnl < 0) {
        return 'sl_hit';
      }
    }
  }
  
  // 3️⃣ Fallback: Classify by PnL
  if (pnl > 0) {
    // Positive PnL = likely TP
    // Check which TP level was most likely hit based on flags
    if (dbPos.tp1Hit && !dbPos.tp2Hit) return 'tp1_hit';
    if (dbPos.tp2Hit && !dbPos.tp3Hit) return 'tp2_hit';
    if (dbPos.tp3Hit) return 'tp3_hit';
    return 'tp_main_hit'; // Generic TP if no flags
  } else if (pnl < 0) {
    // Negative PnL = likely SL
    return 'sl_hit';
  } else {
    // PnL = 0 = manually closed at breakeven
    return 'closed_on_exchange';
  }
}

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

    // ✅ NEW: Get closed positions history from Bybit for better close reason detection
    let bybitHistory: any[] = [];
    try {
      bybitHistory = await getBybitPositionsHistory(apiKey, apiSecret, 100);
      console.log(`[Sync] Fetched ${bybitHistory.length} entries from Bybit history`);
    } catch (error) {
      console.warn("[Sync] Failed to fetch Bybit history:", error);
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
      closeReasons: {} as Record<string, number>
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

          // Try to find matching entry in Bybit history for precise PnL
          const historyEntry = bybitHistory.find((h: any) => {
            const hSymbol = h.symbol;
            const hSide = h.side;
            const hTime = new Date(parseInt(h.updatedTime));
            const timeDiff = Math.abs(hTime.getTime() - closedAt.getTime());
            
            // Match by symbol, side, and recent close time (within 5 minutes)
            return hSymbol === bybitSymbol && 
                   hSide === dbPos.side && 
                   timeDiff < 5 * 60 * 1000;
          });

          let pnl = dbPos.unrealisedPnl; // Last known PnL (fallback)
          let closePrice = dbPos.entryPrice; // Fallback close price

          if (historyEntry) {
            pnl = parseFloat(historyEntry.closedPnl || "0");
            closePrice = parseFloat(historyEntry.avgExitPrice || closePrice);
            console.log(`[Sync] Found Bybit history entry: PnL=${pnl.toFixed(2)}, ClosePrice=${closePrice.toFixed(4)}`);
          } else {
            console.log(`[Sync] No Bybit history match - using last known PnL=${pnl.toFixed(2)}`);
          }

          const pnlPercent = (pnl / dbPos.initialMargin) * 100;

          // ✅ ENHANCED: Detect close reason based on TP flags, PnL, and Bybit data
          const closeReason = detectCloseReason(dbPos, pnl, historyEntry);
          
          console.log(`[Sync] Detected close reason: ${closeReason}`);
          
          // Track close reason stats
          syncResults.closeReasons[closeReason] = (syncResults.closeReasons[closeReason] || 0) + 1;

          // Save to position_history
          await db.insert(positionHistory).values({
            positionId: dbPos.id,
            alertId: dbPos.alertId,
            symbol: dbPos.symbol,
            side: dbPos.side,
            tier: dbPos.tier,
            entryPrice: dbPos.entryPrice,
            closePrice,
            quantity: dbPos.quantity,
            leverage: dbPos.leverage,
            pnl,
            pnlPercent,
            closeReason,
            tp1Hit: dbPos.tp1Hit,
            tp2Hit: dbPos.tp2Hit,
            tp3Hit: dbPos.tp3Hit,
            confirmationCount: dbPos.confirmationCount,
            openedAt: dbPos.openedAt,
            closedAt: closedAt.toISOString(),
            durationMinutes,
            alertData: dbPos.alertData,
          });

          // Update position status to closed
          await db
            .update(botPositions)
            .set({
              status: "closed",
              closedAt: closedAt.toISOString(),
              closeReason,
            })
            .where(eq(botPositions.id, dbPos.id));

          // Log action
          await db.insert(botActions).values({
            actionType: "position_closed",
            symbol: dbPos.symbol,
            side: dbPos.side,
            reason: closeReason,
            details: JSON.stringify({
              message: "Position closed on Bybit, synced to database",
              positionId: dbPos.id,
              pnl: pnl.toFixed(2),
              closeReason,
              hadBybitHistory: !!historyEntry
            }),
            success: true,
            createdAt: new Date().toISOString(),
          });

          syncResults.closed++;
          console.log(`[Sync] ✅ Synced position ${dbPos.symbol} ${dbPos.side} (Reason: ${closeReason})`);
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
          console.log(`[Sync] Updated PnL for ${dbPos.symbol}: ${updatedPnl.toFixed(2)}`);
        }
      }
    }

    console.log(`[Sync] Complete: ${syncResults.closed} closed, ${syncResults.stillOpen} still open`);
    console.log(`[Sync] Close reasons breakdown:`, syncResults.closeReasons);

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