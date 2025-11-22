import { NextRequest, NextResponse } from "next/server";
import { modifyBybitTpSl } from "@/lib/bybit-helpers";

// ============================================
// 📨 POST ENDPOINT - MODIFY TP/SL (BYBIT ONLY)
// ============================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      exchange,
      apiKey,
      apiSecret,
      symbol,
      stopLoss,
      takeProfit,
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
      await modifyBybitTpSl(
        symbol,
        apiKey,
        apiSecret,
        takeProfit ? parseFloat(takeProfit) : undefined,
        stopLoss ? parseFloat(stopLoss) : undefined
      );

      return NextResponse.json({
        success: true,
        message: "TP/SL modifications completed",
      });
    } catch (err) {
      return NextResponse.json(
        {
          success: false,
          message: err instanceof Error ? err.message : "Unknown error",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error modifying TP/SL:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}