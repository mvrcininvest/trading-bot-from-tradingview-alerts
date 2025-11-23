import { NextResponse } from "next/server";
import { db } from "@/db";
import { botPositions, positionHistory } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Migrate closed positions from bot_positions to position_history
 * This fixes the issue where positions were closed but not saved to history
 * due to Bybit API connection issues
 */
export async function POST() {
  try {
    console.log("🔄 [MIGRATE] Starting migration of closed positions to history...");

    // Find all closed positions
    const closedPositions = await db
      .select()
      .from(botPositions)
      .where(eq(botPositions.status, "closed"));

    console.log(`📊 [MIGRATE] Found ${closedPositions.length} closed positions`);

    if (closedPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No closed positions to migrate",
        migrated: 0,
        skipped: 0,
        errors: []
      });
    }

    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const pos of closedPositions) {
      try {
        // Check if already exists in history
        const existing = await db
          .select()
          .from(positionHistory)
          .where(eq(positionHistory.positionId, pos.id))
          .limit(1);

        if (existing.length > 0) {
          console.log(`  ⏭️  Position ${pos.id} (${pos.symbol}) already in history - skipping`);
          skipped++;
          continue;
        }

        // Calculate close price and PnL
        const openedAt = new Date(pos.openedAt);
        const closedAt = pos.closedAt ? new Date(pos.closedAt) : new Date();
        const durationMinutes = Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);

        // Use unrealisedPnl as final PnL (last known value before close)
        const pnl = pos.unrealisedPnl || 0;
        const pnlPercent = pos.initialMargin > 0 ? (pnl / pos.initialMargin) * 100 : 0;

        // Estimate close price from PnL
        let closePrice = pos.entryPrice;
        if (pos.quantity > 0) {
          const priceDiff = pnl / pos.quantity;
          if (pos.side === "BUY") {
            closePrice = pos.entryPrice + priceDiff;
          } else {
            closePrice = pos.entryPrice - priceDiff;
          }
        }

        // Insert to position_history
        await db.insert(positionHistory).values({
          positionId: pos.id,
          symbol: pos.symbol,
          side: pos.side,
          tier: pos.tier,
          entryPrice: pos.entryPrice,
          closePrice: closePrice,
          quantity: pos.quantity,
          leverage: pos.leverage,
          pnl: pnl,
          pnlPercent: pnlPercent,
          closeReason: pos.closeReason || "migrated",
          tp1Hit: pos.tp1Hit || false,
          tp2Hit: pos.tp2Hit || false,
          tp3Hit: pos.tp3Hit || false,
          confirmationCount: pos.confirmationCount || 1,
          openedAt: pos.openedAt,
          closedAt: closedAt.toISOString(),
          durationMinutes: durationMinutes,
        });

        console.log(`  ✅ Migrated position ${pos.id} (${pos.symbol} ${pos.side}): PnL ${pnl.toFixed(2)} USDT`);
        migrated++;

      } catch (error: any) {
        const errorMsg = `Failed to migrate position ${pos.id} (${pos.symbol}): ${error.message}`;
        console.error(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`✅ [MIGRATE] Completed: ${migrated} migrated, ${skipped} skipped, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      message: `Migration completed: ${migrated} positions migrated to history`,
      migrated,
      skipped,
      errors,
      totalProcessed: closedPositions.length
    });

  } catch (error: any) {
    console.error("❌ [MIGRATE] Fatal error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error during migration"
      },
      { status: 500 }
    );
  }
}
