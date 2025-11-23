import { NextRequest, NextResponse } from "next/server";
import { closeBybitPosition, getRealizedPnlFromBybit } from "@/lib/bybit-helpers";
import { db } from "@/db";
import { botPositions, positionHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ============================================
// 📨 POST ENDPOINT - CLOSE POSITION (BYBIT ONLY)
// ============================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      exchange,
      apiKey,
      apiSecret,
      symbol,
    } = body;

    if (!exchange || !apiKey || !apiSecret || !symbol) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Only support Bybit
    if (exchange !== "bybit") {
      return NextResponse.json(
        { success: false, message: "Only Bybit mainnet is supported." },
        { status: 400 }
      );
    }

    try {
      // Get position from database BEFORE closing
      const positions = await db.select()
        .from(botPositions)
        .where(
          and(
            eq(botPositions.symbol, symbol),
            eq(botPositions.status, "open")
          )
        )
        .limit(1);

      if (positions.length === 0) {
        return NextResponse.json(
          { success: false, message: `No open position found for ${symbol}` },
          { status: 404 }
        );
      }

      const position = positions[0];
      
      // Close position on exchange
      const orderId = await closeBybitPosition(symbol, position.side, apiKey, apiSecret);

      // Get current market price
      const { getCurrentMarketPrice } = await import("@/lib/bybit-helpers");
      const closePrice = await getCurrentMarketPrice(symbol, apiKey, apiSecret);

      // Calculate PnL
      const isLong = position.side === 'BUY';
      const priceDiff = isLong 
        ? (closePrice - position.entryPrice) 
        : (position.entryPrice - closePrice);
      
      let realizedPnl = priceDiff * position.quantity;

      // Try to get realized PnL from Bybit
      const pnlData = await getRealizedPnlFromBybit(orderId, symbol, apiKey, apiSecret);
      if (pnlData) {
        realizedPnl = pnlData.realizedPnl;
        console.log(`✅ Got realized PnL from Bybit: ${realizedPnl.toFixed(2)} USD`);
      } else {
        console.log(`⚠️ Using estimated PnL: ${realizedPnl.toFixed(2)} USD`);
      }

      const pnlPercent = (realizedPnl / position.initialMargin) * 100;

      // Calculate duration
      const openedAt = new Date(position.openedAt);
      const closedAt = new Date();
      const durationMinutes = Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);

      // Update bot_positions status in DB
      await db.update(botPositions)
        .set({
          status: "closed",
          closeReason: "manual_close",
          closedAt: closedAt.toISOString()
        })
        .where(
          and(
            eq(botPositions.symbol, symbol),
            eq(botPositions.status, "open")
          )
        );

      // Save to positionHistory
      await db.insert(positionHistory).values({
        positionId: position.id,
        symbol: position.symbol,
        side: position.side,
        tier: position.tier,
        entryPrice: position.entryPrice,
        closePrice,
        quantity: position.quantity,
        leverage: position.leverage,
        pnl: realizedPnl,
        pnlPercent,
        closeReason: "manual_close",
        tp1Hit: position.tp1Hit || false,
        tp2Hit: position.tp2Hit || false,
        tp3Hit: position.tp3Hit || false,
        confirmationCount: position.confirmationCount || 1,
        openedAt: position.openedAt,
        closedAt: closedAt.toISOString(),
        durationMinutes,
        alertData: position.alertData, // ✅ FIXED: Preserve alert data
      });

      console.log(`✅ Position saved to history: PnL ${realizedPnl.toFixed(2)} USD (${pnlPercent.toFixed(2)}%)`);

      return NextResponse.json({
        success: true,
        message: `Bybit position closed successfully`,
        data: { 
          orderId,
          pnl: realizedPnl,
          pnlPercent,
          closePrice
        }
      });
    } catch (error) {
      console.error("Error closing Bybit position:", error);
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error closing position:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}