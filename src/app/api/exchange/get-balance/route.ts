import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const BINANCE_TESTNET_URL = "https://testnet.binance.vision";
const BINANCE_MAINNET_URL = "https://api.binance.com";
const BYBIT_TESTNET_URL = "https://api-testnet.bybit.com";
const BYBIT_DEMO_URL = "https://api-demo.bybit.com";
const BYBIT_MAINNET_URL = "https://api.bybit.com";

function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): string {
  const paramString = timestamp + apiKey + "5000" + JSON.stringify(params);
  return crypto.createHmac("sha256", apiSecret).update(paramString).digest("hex");
}

function createBinanceSignature(
  apiSecret: string,
  queryString: string
): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

async function getBinanceBalance(
  apiKey: string,
  apiSecret: string,
  testnet: boolean
) {
  const baseUrl = testnet ? BINANCE_TESTNET_URL : BINANCE_MAINNET_URL;
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = createBinanceSignature(apiSecret, queryString);

  const response = await fetch(
    `${baseUrl}/api/v3/account?${queryString}&signature=${signature}`,
    {
      headers: {
        "X-MBX-APIKEY": apiKey,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Binance API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    success: true,
    balances: data.balances
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: b.free,
        locked: b.locked,
      })),
    canTrade: data.canTrade,
  };
}

async function getBybitBalance(
  apiKey: string,
  apiSecret: string,
  demo: boolean,
  testnet: boolean
) {
  const baseUrl = demo ? BYBIT_DEMO_URL : testnet ? BYBIT_TESTNET_URL : BYBIT_MAINNET_URL;
  const timestamp = Date.now();
  const params = {
    accountType: "UNIFIED",
  };

  const signature = createBybitSignature(apiKey, apiSecret, timestamp, params);
  const queryParams = new URLSearchParams({
    accountType: "UNIFIED",
  });

  const response = await fetch(
    `${baseUrl}/v5/account/wallet-balance?${queryParams.toString()}`,
    {
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp.toString(),
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": "5000",
        "Content-Type": "application/json",
      },
    }
  );

  const responseText = await response.text();

  if (!response.ok) {
    if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html")) {
      throw new Error("CloudFlare/WAF block (403). Twoje klucze mogą być poprawne, ale API jest chronione.");
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
    const { exchange, apiKey, apiSecret, testnet = false, demo = false } = body;

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Brak wymaganych parametrów" },
        { status: 400 }
      );
    }

    let result;

    if (exchange === "binance") {
      result = await getBinanceBalance(apiKey, apiSecret, testnet);
    } else if (exchange === "bybit") {
      result = await getBybitBalance(apiKey, apiSecret, demo, testnet);
    } else {
      return NextResponse.json(
        { success: false, message: "Nieobsługiwana giełda" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Nieznany błąd podczas pobierania salda",
      },
      { status: 500 }
    );
  }
}