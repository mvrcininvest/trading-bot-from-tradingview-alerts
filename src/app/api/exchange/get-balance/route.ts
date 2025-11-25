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

    // ✅ FIX: Use direct Bybit connection from bybit-helpers
    const result = await getBybitWalletBalance(apiKey, apiSecret);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error while fetching balance",
      },
      { status: 500 }
    );
  }
}