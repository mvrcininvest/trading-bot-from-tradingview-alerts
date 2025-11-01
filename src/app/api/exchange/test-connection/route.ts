import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import axios from "axios";

interface TestConnectionRequest {
  exchange: "okx";
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  demo: boolean;
}

// ============================================
// 🔐 OKX API TEST (ONLY)
// ============================================

async function testOkxConnection(apiKey: string, apiSecret: string, passphrase: string, demo: boolean = false) {
  const baseUrl = "https://www.okx.com";
  
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  
  const signString = timestamp + method + requestPath;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(signString)
    .digest("base64");

  const url = `${baseUrl}${requestPath}`;

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  try {
    const response = await axios.get(url, {
      headers,
      timeout: 10000,
    });

    const data = response.data;

    if (data.code !== "0") {
      return {
        success: false,
        message: `OKX API Error (${data.code}): ${data.msg || "Unknown error"}`,
      };
    }

    // Extract balances
    const balances = data.data?.[0]?.details?.map((detail: any) => ({
      asset: detail.ccy,
      free: detail.availBal || "0",
      locked: detail.frozenBal || "0",
    })) || [];

    return {
      success: true,
      message: `✅ Połączenie z OKX ${demo ? "Demo" : "Mainnet"} udane! Konto jest gotowe do tradingu.`,
      accountInfo: {
        canTrade: true,
        balances: balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0),
      },
    };
  } catch (error: any) {
    if (error.response) {
      const errorData = error.response.data;
      return {
        success: false,
        message: `OKX API Error: ${errorData?.msg || error.response.statusText} (Code: ${errorData?.code || error.response.status})`,
      };
    }
    return {
      success: false,
      message: `Błąd połączenia: ${error.message}`,
    };
  }
}

// ============================================
// 📨 POST ENDPOINT
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: TestConnectionRequest = await request.json();
    const { exchange, apiKey, apiSecret, passphrase, demo } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "API Key i Secret są wymagane" },
        { status: 400 }
      );
    }

    // Only support OKX
    if (exchange !== "okx") {
      return NextResponse.json(
        { success: false, message: "Only OKX is supported. Update your exchange to OKX." },
        { status: 400 }
      );
    }

    if (!passphrase) {
      return NextResponse.json(
        { success: false, message: "Passphrase jest wymagane dla OKX" },
        { status: 400 }
      );
    }

    const result = await testOkxConnection(apiKey, apiSecret, passphrase, demo);

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