import { NextRequest, NextResponse } from "next/server";
import { getBybitPositions, closeBybitPosition } from "@/lib/bybit-helpers";
import { sendEmergencyCloseFailureAlert } from "@/lib/sms-service";
import { db } from "@/db";
import { botPositions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ============================================
// 📨 POST ENDPOINT - CLOSE ALL POSITIONS (BYBIT ONLY)
// ============================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      exchange,
      apiKey,
      apiSecret,
    } = body;

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Only support Bybit
    if (exchange !== "bybit") {
      return NextResponse.json(
        { success: false, message: "Only Bybit mainnet is supported" },
        { status: 400 }
      );
    }

    const results = {
      positionsClosed: 0,
      errors: [] as string[],
      details: [] as any[]
    };

    try {
      // Get all open positions
      console.log("\n🔍 Fetching all open positions...");
      const openPositions = await getBybitPositions(apiKey, apiSecret);
      
      console.log(`   Found ${openPositions.length} open positions`);
      
      const totalPositions = openPositions.length;

      // Close each position
      for (const position of openPositions) {
        try {
          const symbol = position.symbol;
          const side = position.side === 'Buy' ? 'BUY' : 'SELL';
          
          console.log(`\n📉 Closing position: ${symbol} (${side})`);
          
          const orderId = await closeBybitPosition(symbol, side, apiKey, apiSecret);

          results.positionsClosed++;
          results.details.push({
            symbol,
            action: "closed",
            success: true,
            orderId
          });
          console.log(`   ✅ Position closed: ${symbol}`);
          
          // Update bot_positions status in DB
          try {
            await db.update(botPositions)
              .set({
                status: "closed",
                closeReason: "manual_close_all",
                closedAt: new Date().toISOString()
              })
              .where(
                and(
                  eq(botPositions.symbol, symbol),
                  eq(botPositions.side, side),
                  eq(botPositions.status, "open")
                )
              );
          } catch (dbError) {
            console.error(`   ⚠️ Failed to update DB for ${symbol}:`, dbError);
          }
        } catch (posError: any) {
          results.errors.push(`Failed to close ${position.symbol}: ${posError.message}`);
          results.details.push({
            symbol: position.symbol,
            action: "close_failed",
            error: posError.message
          });
          console.error(`   ❌ Failed to close ${position.symbol}:`, posError);
        }
      }

      // ✅ NEW: Send SMS alert if some positions failed to close
      const failedPositions = totalPositions - results.positionsClosed;
      if (failedPositions > 0) {
        console.log(`\n📱 Sending SMS alert for ${failedPositions} failed closes...`);
        try {
          const smsResult = await sendEmergencyCloseFailureAlert(failedPositions, totalPositions);
          if (smsResult.success) {
            console.log(`   ✅ SMS alert sent successfully (Message ID: ${smsResult.messageId})`);
          } else {
            console.log(`   ⚠️ SMS alert failed: ${smsResult.error}`);
          }
        } catch (smsError: any) {
          console.error(`   ❌ SMS alert error: ${smsError.message}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Closed ${results.positionsClosed} positions`,
        results
      });

    } catch (error: any) {
      console.error("Error in close-all-positions:", error);
      return NextResponse.json(
        {
          success: false,
          message: error.message || "Unknown error",
          results
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in close-all-positions endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}