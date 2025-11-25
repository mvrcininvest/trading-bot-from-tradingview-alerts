import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// ✅ FIX: Build full URL for fetch
const getBybitApiUrl = (path: string) => {
  // In production (Vercel), use absolute URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/bybit-edge-proxy${path}`;
  }
  // In local dev, use full localhost URL
  return `http://localhost:3000/api/bybit-edge-proxy${path}`;
};

function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  params: string
): string {
  const message = timestamp + apiKey + recvWindow + params;
  return crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
}

async function getBybitBalance(
  apiKey: string,
  apiSecret: string
) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const queryParams = new URLSearchParams({
    accountType: "UNIFIED",
  });

  const paramsString = queryParams.toString();
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, paramsString);

  // ✅ FIX: Build full URL with path
  const fullUrl = getBybitApiUrl(`/v5/account/wallet-balance?${paramsString}`);

  const response = await fetch(fullUrl, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": recvWindow,
      "X-BAPI-SIGN-TYPE": "2",
      "Content-Type": "application/json",
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html")) {
      throw new Error("CloudFlare/WAF block (403). Your keys may be correct, but API is protected.");
    }
    throw new Error(`Bybit API error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  // Extract balances from Bybit unified account
  const balances: Array<{ asset: string; free: string; locked: string }> = [];
  
  if (data.result?.list?.[0]?.coin) {
    data.result.list[0].coin.forEach((coin: any) => {
      const free = parseFloat(coin.availableToWithdraw || coin.walletBalance || "0");
      const locked = parseFloat(coin.locked || "0");
      
      if (free > 0 || locked > 0) {
        balances.push({
          asset: coin.coin,
          free: free.toFixed(8),
          locked: locked.toFixed(8),
        });
      }
    });
  }

  return {
    success: true,
    balances,
    canTrade: true,
  };
}

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

    const result = await getBybitBalance(apiKey, apiSecret);

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