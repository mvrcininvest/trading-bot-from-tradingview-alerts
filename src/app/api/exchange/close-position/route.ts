import { NextRequest, NextResponse } from "next/server";
import { closeBybitPosition } from "@/lib/bybit-helpers";
import { db } from "@/db";
import { botPositions } from "@/db/schema";
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
      // Get position side from database
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
      const orderId = await closeBybitPosition(symbol, position.side, apiKey, apiSecret);

      // Update bot_positions status in DB
      try {
        await db.update(botPositions)
          .set({
            status: "closed",
            closeReason: "manual_close",
            closedAt: new Date().toISOString()
          })
          .where(
            and(
              eq(botPositions.symbol, symbol),
              eq(botPositions.status, "open")
            )
          );
      } catch (dbError) {
        console.error(`⚠️ Failed to update DB for ${symbol}:`, dbError);
      }

      return NextResponse.json({
        success: true,
        message: `Bybit position closed successfully`,
        data: { orderId }
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