import { NextRequest, NextResponse } from "next/server";
import { getBybitWalletBalance } from "@/lib/bybit-helpers";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exchange, apiKey, apiSecret } = body;

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Missing required parameters" },
        { status: 400 }
      );
    }

    if (exchange !== "bybit") {
      return NextResponse.json(
        { success: false, message: "Only Bybit mainnet is supported" },
        { status: 400 }
      );
    }

    console.log('[Get Balance] Fetching wallet balance...');
    console.log('[Get Balance] VERCEL_URL:', process.env.VERCEL_URL || 'NOT SET');
    console.log('[Get Balance] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || 'NOT SET');

    // ✅ FIX: Use direct Bybit connection from bybit-helpers
    const result = await getBybitWalletBalance(apiKey, apiSecret);

    console.log('[Get Balance] Success:', result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Get Balance] Error:", error);
    console.error("[Get Balance] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error while fetching balance",
      },
      { status: 500 }
    );
  }
}