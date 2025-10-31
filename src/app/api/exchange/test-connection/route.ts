import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import axios from "axios";

interface TestConnectionRequest {
  exchange: "binance" | "bybit" | "okx";
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
  testnet: boolean;
  demo?: boolean;
}

// Binance API test
async function testBinanceConnection(apiKey: string, apiSecret: string, testnet: boolean) {
  const baseUrl = testnet 
    ? "https://testnet.binance.vision" 
    : "https://api.binance.com";
  
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");

  const url = `${baseUrl}/api/v3/account?${queryString}&signature=${signature}`;

  try {
    const response = await axios.get(url, {
      headers: {
        "X-MBX-APIKEY": apiKey,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    const data = response.data;
    
    const balances = data.balances
      ?.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b: any) => ({
        asset: b.asset,
        free: b.free,
        locked: b.locked,
      }));

    return {
      success: true,
      message: "✅ Połączenie z Binance udane! Konto jest gotowe do tradingu.",
      accountInfo: {
        canTrade: data.canTrade,
        balances: balances || [],
      },
    };
  } catch (error: any) {
    if (error.response) {
      return {
        success: false,
        message: `Binance API Error: ${error.response.data?.msg || error.response.statusText}`,
      };
    }
    return {
      success: false,
      message: `Błąd połączenia: ${error.message}`,
    };
  }
}

// Bybit API test
async function testBybitConnection(apiKey: string, apiSecret: string, testnet: boolean, demo: boolean = false) {
  let baseUrl: string;
  if (demo) {
    baseUrl = "https://api-demo.bybit.com";
  } else if (testnet) {
    baseUrl = "https://api-testnet.bybit.com";
  } else {
    baseUrl = "https://api.bybit.com";
  }
  
  const timestamp = Date.now().toString();
  const recvWindow = "20000";
  
  // Simple endpoint to verify API key
  const signaturePayload = timestamp + apiKey + recvWindow;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(signaturePayload)
    .digest("hex");

  const url = `${baseUrl}/v5/user/query-api`;

  try {
    const response = await axios.get(url, {
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      timeout: 15000,
      validateStatus: () => true, // Don't throw on any status
    });

    const data = response.data;

    // Check if we got HTML response (CloudFlare block)
    if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
      return {
        success: false,
        message: `Bybit API jest blokowany przez CloudFlare/WAF (Status ${response.status}). Możliwe rozwiązania:\n1. Dodaj IP serwera do whitelisty w panelu API Bybit\n2. Odczekaj 5-10 minut (możliwe tymczasowe blokowanie)\n3. Sprawdź czy używasz VPN który może być zablokowany\n4. Spróbuj utworzyć nowy klucz API`,
      };
    }

    if (response.status !== 200 || data.retCode !== 0) {
      const errorDetails = `Status: ${response.status}, RetCode: ${data.retCode}, Msg: ${data.retMsg}`;
      return {
        success: false,
        message: `Bybit API Error: ${errorDetails}`,
      };
    }

    // Try to get wallet balance
    const accountTimestamp = Date.now().toString();
    const accountParams = new URLSearchParams({ accountType: "UNIFIED" });
    const accountQueryString = accountParams.toString();
    const accountSignaturePayload = accountTimestamp + apiKey + recvWindow + accountQueryString;
    const accountSignature = crypto
      .createHmac("sha256", apiSecret)
      .update(accountSignaturePayload)
      .digest("hex");

    const accountUrl = `${baseUrl}/v5/account/wallet-balance?${accountQueryString}`;
    
    try {
      const accountResponse = await axios.get(accountUrl, {
        headers: {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-TIMESTAMP": accountTimestamp,
          "X-BAPI-SIGN": accountSignature,
          "X-BAPI-RECV-WINDOW": recvWindow,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        timeout: 15000,
        validateStatus: () => true,
      });

      if (accountResponse.status === 200 && accountResponse.data.retCode === 0) {
        const balances = accountResponse.data.result?.list?.[0]?.coin?.map((c: any) => ({
          asset: c.coin,
          free: c.availableToWithdraw,
          locked: c.locked || "0",
        })) || [];

        return {
          success: true,
          message: "✅ Połączenie z Bybit udane! Konto jest gotowe do tradingu.",
          accountInfo: {
            canTrade: true,
            balances: balances.filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0),
          },
        };
      }
    } catch (balanceError) {
      // If balance fails, still report success since API key is valid
    }

    return {
      success: true,
      message: "✅ Połączenie z Bybit udane! Klucz API jest prawidłowy.",
      accountInfo: {
        canTrade: true,
        balances: [],
      },
    };
  } catch (error: any) {
    if (error.response) {
      const responseData = error.response.data;
      if (typeof responseData === 'string' && responseData.includes('<!DOCTYPE')) {
        return {
          success: false,
          message: `Request jest blokowany przez CloudFlare (Status ${error.response.status}). Spróbuj:\n1. Dodać IP do whitelisty w panelu Bybit\n2. Użyć innego środowiska (Testnet zamiast Demo)\n3. Odczekać kilka minut przed kolejną próbą`,
        };
      }
      return {
        success: false,
        message: `Bybit API Error: ${responseData?.retMsg || error.response.statusText}`,
      };
    }
    return {
      success: false,
      message: `Błąd połączenia: ${error.message}. Sprawdź połączenie internetowe.`,
    };
  }
}

// OKX API test
async function testOkxConnection(apiKey: string, apiSecret: string, passphrase: string, demo: boolean = false) {
  // OKX uses same base URL for both demo and production
  // Demo keys are distinguished by the API key itself
  const baseUrl = "https://www.okx.com";
  
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  
  // OKX signature: Base64(HMAC-SHA256(timestamp + method + requestPath, secretKey))
  const signString = timestamp + method + requestPath;
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(signString)
    .digest("base64");

  const url = `${baseUrl}${requestPath}`;

  try {
    const response = await axios.get(url, {
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
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

export async function POST(request: NextRequest) {
  try {
    const body: TestConnectionRequest = await request.json();
    const { exchange, apiKey, apiSecret, passphrase, testnet, demo } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "API Key i Secret są wymagane" },
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
      result = await testBinanceConnection(apiKey, apiSecret, testnet);
    } else if (exchange === "bybit") {
      result = await testBybitConnection(apiKey, apiSecret, testnet, demo);
    } else if (exchange === "okx") {
      result = await testOkxConnection(apiKey, apiSecret, passphrase!, demo);
    } else {
      return NextResponse.json(
        { success: false, message: "Nieobsługiwana giełda" },
        { status: 400 }
      );
    }

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