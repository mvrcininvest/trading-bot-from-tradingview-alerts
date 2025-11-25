import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ✅ USE VERCEL EDGE PROXY (deployed in Singapore/Hong Kong/Seoul)
// This bypasses CloudFront geo-blocking!
const getBybitProxyUrl = () => {
  // In production (Vercel), use absolute URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/bybit-edge-proxy`;
  }
  // In local dev, use relative path
  return '/api/bybit-edge-proxy';
};

interface BybitHistoryPosition {
  symbol: string;
  side: "Buy" | "Sell";
  avgEntryPrice: string;
  avgExitPrice: string;
  qty: string;
  leverage: string;
  closedPnl: string;
  createdTime: string;
  updatedTime: string;
  orderId: string;
}

async function signBybitRequest(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
) {
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const signString = timestamp + apiKey + 5000 + queryString;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(signString);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "100");
    const daysBack = parseInt(searchParams.get("daysBack") || "30");

    // Get credentials from env
    const apiKey = process.env.BYBIT_API_KEY;
    const apiSecret = process.env.BYBIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Brakuje kluczy API Bybit w .env" },
        { status: 400 }
      );
    }

    console.log(`[Bybit History API] Fetching history for last ${daysBack} days, limit: ${limit}`);

    const now = Date.now();
    const startTime = now - (daysBack * 24 * 60 * 60 * 1000);
    const timestamp = Date.now();

    const params: Record<string, any> = {
      category: "linear",
      startTime: startTime.toString(),
      endTime: now.toString(),
      limit: limit.toString(),
    };

    const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);

    const queryString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    const url = `${getBybitProxyUrl()}/v5/position/closed-pnl?${queryString}`;

    console.log(`[Bybit History API] Fetching from proxy: ${url.split('?')[0]}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp.toString(),
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": "5000",
      },
    });

    const data = await response.json();

    console.log(`[Bybit History API] Response status: ${response.status}`);

    if (data.retCode !== 0) {
      console.error(`[Bybit History API] Error - retCode: ${data.retCode}, retMsg: ${data.retMsg}`);
      return NextResponse.json(
        {
          success: false,
          message: `Błąd Bybit API: ${data.retMsg || 'Unknown error'}`,
          retCode: data.retCode,
        },
        { status: 400 }
      );
    }

    const positions: BybitHistoryPosition[] = data.result?.list || [];

    console.log(`[Bybit History API] ✅ Fetched ${positions.length} positions from Bybit`);

    // Transform to frontend format
    const history = positions.map((pos) => {
      const entryPrice = parseFloat(pos.avgEntryPrice);
      const closePrice = parseFloat(pos.avgExitPrice);
      const qty = parseFloat(pos.qty);
      const leverage = parseInt(pos.leverage);
      const pnl = parseFloat(pos.closedPnl);

      const positionValue = qty * entryPrice;
      const initialMargin = positionValue / leverage;
      const pnlPercent = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;

      const openedAt = new Date(parseInt(pos.createdTime));
      const closedAt = new Date(parseInt(pos.updatedTime));
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      return {
        id: pos.orderId,
        symbol: pos.symbol,
        side: pos.side,
        tier: "Bybit",
        entryPrice,
        closePrice,
        quantity: qty,
        leverage,
        pnl,
        pnlPercent,
        closeReason: pnl > 0 ? "profit" : "loss",
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        durationMinutes,
        source: "bybit" as const,
      };
    });

    return NextResponse.json({
      success: true,
      history,
      total: history.length,
    });
  } catch (error) {
    console.error("[Bybit History API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}