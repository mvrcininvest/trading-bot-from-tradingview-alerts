import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { positionHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ✅ MULTI-PROXY STRATEGY: Try multiple proxy URLs
function getProxyUrls(request: NextRequest): string[] {
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  
  // Build full Vercel Edge proxy URL (avoid localhost)
  let vercelEdgeProxyUrl: string | null = null;
  if (host && !host.includes("localhost")) {
    vercelEdgeProxyUrl = `${protocol}://${host}/api/bybit-edge-proxy`;
  }
  
  return [
    process.env.BYBIT_PROXY_URL, // Fly.io proxy (Amsterdam)
    vercelEdgeProxyUrl, // Vercel Edge proxy (Singapore/Asia) - only if not localhost
    "https://api.allorigins.win/raw?url=", // Public CORS proxy (last resort)
    "https://api.bybit.com", // Direct (if nothing else works)
  ].filter(Boolean) as string[];
}

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

// ✅ FIXED: Use full URL for Vercel Edge proxy
async function fetchBybitHistoryPage(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number,
  request: NextRequest,
  cursor?: string
): Promise<{ positions: BybitHistoryPosition[]; nextCursor: string | null }> {
  const timestamp = Date.now();
  
  const params: Record<string, any> = {
    category: "linear",
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    limit: 100,
  };

  if (cursor) {
    params.cursor = cursor;
  }

  const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);

  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const headers = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-TIMESTAMP": timestamp.toString(),
    "X-BAPI-SIGN": signature,
    "X-BAPI-RECV-WINDOW": "5000",
    "Content-Type": "application/json",
  };

  // ✅ Try each proxy until one works
  const PROXY_URLS = getProxyUrls(request);
  let lastError: Error | null = null;
  
  for (const proxyUrl of PROXY_URLS) {
    if (!proxyUrl) continue;

    try {
      // Special handling for CORS proxy
      const isCorsProxy = proxyUrl.includes("allorigins");
      let fullUrl: string;
      
      if (isCorsProxy) {
        // Encode the full Bybit URL for CORS proxy
        const bybitUrl = encodeURIComponent(`https://api.bybit.com/v5/position/closed-pnl?${queryString}`);
        fullUrl = `${proxyUrl}${bybitUrl}`;
      } else {
        fullUrl = `${proxyUrl}/v5/position/closed-pnl?${queryString}`;
      }

      console.log(`[Import] Trying proxy: ${proxyUrl}`);

      const response = await fetch(fullUrl, {
        method: "GET",
        headers: isCorsProxy ? { "Content-Type": "application/json" } : headers,
      });

      const data = await response.json();

      // Check if CloudFront blocked
      if (response.status === 403) {
        console.log(`[Import] ❌ Proxy ${proxyUrl} blocked (403)`);
        lastError = new Error(`Geo-blocked by CloudFront`);
        continue;
      }

      if (data.retCode !== 0) {
        console.log(`[Import] ❌ Proxy ${proxyUrl} API error: ${data.retMsg} (retCode: ${data.retCode})`);
        lastError = new Error(`Bybit API error: ${data.retMsg}`);
        continue;
      }

      console.log(`[Import] ✅ Success using proxy: ${proxyUrl}`);
      
      return {
        positions: data.result?.list || [],
        nextCursor: data.result?.nextPageCursor || null,
      };
    } catch (error) {
      console.log(`[Import] ❌ Proxy ${proxyUrl} failed:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }

  // All proxies failed
  throw lastError || new Error("All proxy attempts failed");
}

// ✅ Fetch all positions for a 7-day segment
async function fetchBybitHistorySegment(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number,
  request: NextRequest
): Promise<BybitHistoryPosition[]> {
  let allPositions: BybitHistoryPosition[] = [];
  let cursor: string | null = null;
  let pageCount = 0;

  do {
    pageCount++;
    const { positions, nextCursor } = await fetchBybitHistoryPage(
      apiKey,
      apiSecret,
      startTime,
      endTime,
      request,
      cursor || undefined
    );

    allPositions = [...allPositions, ...positions];
    cursor = nextCursor;

    if (pageCount >= 20) {
      console.log(`[Import] ⚠️ Reached safety limit of 20 pages for this segment`);
      break;
    }
  } while (cursor);

  return allPositions;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiSecret, daysBack = 30 } = body;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Missing API credentials" },
        { status: 400 }
      );
    }

    console.log(`[Import Bybit History] 🚀 Starting import for last ${daysBack} days using multi-proxy strategy...`);

    // ✅ Divide time range into 7-day segments
    const now = Date.now();
    const totalMs = daysBack * 24 * 60 * 60 * 1000;
    const segmentMs = 7 * 24 * 60 * 60 * 1000;
    const segments: Array<{ start: number; end: number }> = [];

    let currentStart = now - totalMs;
    while (currentStart < now) {
      const currentEnd = Math.min(currentStart + segmentMs, now);
      segments.push({ start: currentStart, end: currentEnd });
      currentStart = currentEnd;
    }

    console.log(`[Import] Created ${segments.length} segments of max 7 days each`);

    let allPositions: BybitHistoryPosition[] = [];

    // ✅ Fetch each 7-day segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentStartDate = new Date(segment.start).toISOString().split('T')[0];
      const segmentEndDate = new Date(segment.end).toISOString().split('T')[0];
      
      console.log(`[Import] Fetching segment ${i + 1}/${segments.length}: ${segmentStartDate} to ${segmentEndDate}`);

      try {
        const segmentPositions = await fetchBybitHistorySegment(
          apiKey,
          apiSecret,
          segment.start,
          segment.end,
          request
        );

        allPositions = [...allPositions, ...segmentPositions];
        console.log(`[Import] Segment ${i + 1}: ${segmentPositions.length} positions, Total so far: ${allPositions.length}`);
      } catch (error) {
        console.error(`[Import] ❌ Error fetching segment ${i + 1}:`, error);
        // Continue with next segment
      }
    }

    console.log(`[Import Bybit History] ✅ Fetched ${allPositions.length} total positions from Bybit`);

    if (allPositions.length === 0) {
      return NextResponse.json({
        success: false,
        message: "Nie udało się pobrać danych z Bybit - wszystkie proxy zablokowały CloudFront",
        imported: 0,
        skipped: 0,
        total: 0,
      });
    }

    // Get existing history from database
    const existingHistory = await db.select().from(positionHistory);
    console.log(`[Import Bybit History] Found ${existingHistory.length} positions in bot history`);

    let imported = 0;
    let skipped = 0;

    for (const bybitPos of allPositions) {
      const entryPrice = parseFloat(bybitPos.avgEntryPrice);
      const exitPrice = parseFloat(bybitPos.avgExitPrice);
      const qty = parseFloat(bybitPos.qty);
      const pnl = parseFloat(bybitPos.closedPnl);
      const leverage = parseInt(bybitPos.leverage);

      const closedAt = new Date(parseInt(bybitPos.updatedTime));
      const openedAt = new Date(parseInt(bybitPos.createdTime));

      // Check if position already exists
      const exists = existingHistory.some((existing) => {
        const isSameSymbol = existing.symbol === bybitPos.symbol;
        const isSameSide = existing.side === bybitPos.side;
        const isSimilarEntry = Math.abs(existing.entryPrice - entryPrice) < entryPrice * 0.001;
        const isSameCloseTime = 
          existing.closedAt && 
          Math.abs(new Date(existing.closedAt).getTime() - closedAt.getTime()) < 300000;

        return isSameSymbol && isSameSide && isSimilarEntry && isSameCloseTime;
      });

      if (exists) {
        skipped++;
        continue;
      }

      // Calculate ROE
      const positionValue = qty * entryPrice;
      const initialMargin = positionValue / leverage;
      const pnlPercent = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;

      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      let closeReason = "closed_on_exchange";
      if (pnl > 0) {
        closeReason = "tp_main_hit";
      } else if (pnl < 0) {
        closeReason = "sl_hit";
      }

      await db.insert(positionHistory).values({
        positionId: null,
        alertId: null,
        symbol: bybitPos.symbol,
        side: bybitPos.side,
        tier: "Standard",
        entryPrice,
        closePrice: exitPrice,
        quantity: qty,
        leverage,
        pnl,
        pnlPercent,
        closeReason,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        confirmationCount: 0,
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        durationMinutes,
      });

      imported++;
    }

    console.log(`[Import Bybit History] ✅ Complete: ${imported} imported, ${skipped} skipped out of ${allPositions.length} total`);

    return NextResponse.json({
      success: true,
      message: `✅ Import zakończony: ${imported} nowych pozycji, ${skipped} już w bazie`,
      imported,
      skipped,
      total: allPositions.length,
      segments: segments.length,
    });
  } catch (error) {
    console.error("[Import Bybit History] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}