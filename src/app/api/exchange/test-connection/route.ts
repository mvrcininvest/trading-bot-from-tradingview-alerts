import { NextRequest, NextResponse } from "next/server";
import { getBybitWalletBalance } from "@/lib/bybit-helpers";

interface TestConnectionRequest {
  exchange: "bybit";
  apiKey: string;
  apiSecret: string;
}

// ============================================
// 🔐 BYBIT API TEST (MAINNET ONLY)
// ============================================

async function testBybitConnection(apiKey: string, apiSecret: string) {
  try {
    const result = await getBybitWalletBalance(apiKey, apiSecret);

    return {
      success: true,
      message: `✅ Połączenie z Bybit Mainnet udane! Konto jest gotowe do tradingu.`,
      accountInfo: {
        canTrade: true,
        balances: result.balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Bybit API Error: ${error.message}`,
    };
  }
}

// ============================================
// 📨 POST ENDPOINT
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: TestConnectionRequest = await request.json();
    const { exchange, apiKey, apiSecret } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "API Key i Secret są wymagane" },
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

    const result = await testBybitConnection(apiKey, apiSecret);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: `Błąd serwera: ${error instanceof Error ? error.message : "Nieznany błąd"}`,
      },
      { status: 500 }
    );
  }
}