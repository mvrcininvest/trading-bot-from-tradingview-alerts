import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const BINANCE_TESTNET_URL = "https://testnet.binance.vision";
const BINANCE_MAINNET_URL = "https://api.binance.com";
const BYBIT_TESTNET_URL = "https://api-testnet.bybit.com";
const BYBIT_DEMO_URL = "https://api-demo.bybit.com";
const BYBIT_MAINNET_URL = "https://api.bybit.com";
const OKX_BASE_URL = "https://www.okx.com";
const TOOBIT_BASE_URL = "https://api.toobit.com";

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

function createToobitSignature(
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): string {
  // Toobit uses HMAC SHA256 signature similar to Binance
  const paramString = JSON.stringify(params);
  return crypto.createHmac("sha256", apiSecret).update(paramString).digest("hex");
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

async function getOkxBalance(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  
  // OKX signature: Base64(HMAC-SHA256(timestamp + method + requestPath, secretKey))
  const signString = timestamp + method + requestPath;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(signString)
    .digest("base64");

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  // Add x-simulated-trading header for demo environment
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  const response = await fetch(
    `${OKX_BASE_URL}${requestPath}`,
    {
      headers,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OKX API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== "0") {
    throw new Error(`OKX API error (${data.code}): ${data.msg || "Unknown error"}`);
  }

  // Extract balances from OKX response
  const balances: Array<{ asset: string; free: string; locked: string }> = [];
  
  if (data.data?.[0]?.details) {
    data.data[0].details.forEach((detail: any) => {
      const free = parseFloat(detail.availBal || "0");
      const locked = parseFloat(detail.frozenBal || "0");
      
      if (free > 0 || locked > 0) {
        balances.push({
          asset: detail.ccy,
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

async function getToobitBalance(
  apiKey: string,
  apiSecret: string
) {
  const timestamp = Date.now();
  const params = {
    apiKey,
    timestamp,
  };

  const signature = createToobitSignature(apiSecret, timestamp, params);
  const queryParams = new URLSearchParams({
    apiKey,
    timestamp: timestamp.toString(),
    signature,
  });

  const response = await fetch(
    `${TOOBIT_BASE_URL}/swap/v1/account/balance?${queryParams.toString()}`,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Toobit API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`Toobit API error: ${data.msg || "Unknown error"}`);
  }

  // Extract balances from Toobit response
  const balances: Array<{ asset: string; free: string; locked: string }> = [];
  
  if (data.data?.balances) {
    data.data.balances.forEach((balance: any) => {
      const free = parseFloat(balance.available || "0");
      const locked = parseFloat(balance.locked || "0");
      
      if (free > 0 || locked > 0) {
        balances.push({
          asset: balance.asset,
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
    const { exchange, apiKey, apiSecret, passphrase, testnet = false, demo = false } = body;

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Brak wymaganych parametrów" },
        { status: 400 }
      );
    }

    if (exchange === "okx" && !passphrase) {
      return NextResponse.json(
        { success: false, message: "Passphrase jest wymagane dla OKX" },
        { status: 400 }
      );
    }

    let result;

    if (exchange === "binance") {
      result = await getBinanceBalance(apiKey, apiSecret, testnet);
    } else if (exchange === "bybit") {
      result = await getBybitBalance(apiKey, apiSecret, demo, testnet);
    } else if (exchange === "okx") {
      result = await getOkxBalance(apiKey, apiSecret, passphrase, demo);
    } else if (exchange === "toobit") {
      result = await getToobitBalance(apiKey, apiSecret);
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