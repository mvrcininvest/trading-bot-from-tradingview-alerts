import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { positionHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ✅ USE PROXY URL FROM ENV
const BYBIT_PROXY_URL = process.env.BYBIT_PROXY_URL || "https://bybit-proxy-dawn-snowflake-6188.fly.dev/proxy/bybit";

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

async function fetchBybitHistoryPage(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number,
  cursor?: string
): Promise<{ positions: BybitHistoryPosition[]; nextCursor: string | null }> {
  const timestamp = Date.now();
  
  const params: Record<string, any> = {
    category: "linear",
    startTime: startTime.toString(),
    endTime: endTime.toString(),
    limit: 100, // Max limit per page
  };

  if (cursor) {
    params.cursor = cursor;
  }

  const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);

  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const url = `${BYBIT_PROXY_URL}/v5/position/closed-pnl?${queryString}`;

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

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  return {
    positions: data.result?.list || [],
    nextCursor: data.result?.nextPageCursor || null,
  };
}

// ✅ NOWA FUNKCJA: Fetch all positions for a 7-day segment
async function fetchBybitHistorySegment(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number
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
      cursor || undefined
    );

    allPositions = [...allPositions, ...positions];
    cursor = nextCursor;

    // Safety limit - max 20 pages per segment (2000 positions)
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

    console.log(`[Import Bybit History] Starting import for last ${daysBack} days...`);

    // ✅ NOWE: Divide time range into 7-day segments (Bybit limit)
    const now = Date.now();
    const totalMs = daysBack * 24 * 60 * 60 * 1000;
    const segmentMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const segments: Array<{ start: number; end: number }> = [];

    // Create 7-day segments from oldest to newest
    let currentStart = now - totalMs;
    while (currentStart < now) {
      const currentEnd = Math.min(currentStart + segmentMs, now);
      segments.push({ start: currentStart, end: currentEnd });
      currentStart = currentEnd;
    }

    console.log(`[Import] Created ${segments.length} segments of max 7 days each`);

    let allPositions: BybitHistoryPosition[] = [];

    // ✅ NOWE: Fetch each 7-day segment
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
          segment.end
        );

        allPositions = [...allPositions, ...segmentPositions];
        console.log(`[Import] Segment ${i + 1}: ${segmentPositions.length} positions, Total so far: ${allPositions.length}`);
      } catch (error) {
        console.error(`[Import] ❌ Error fetching segment ${i + 1}:`, error);
        // Continue with next segment instead of failing completely
      }
    }

    console.log(`[Import Bybit History] ✅ Fetched ${allPositions.length} total positions from Bybit across ${segments.length} segments`);

    if (allPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No positions found on Bybit",
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

      // Check if position already exists in history
      const closedAt = new Date(parseInt(bybitPos.updatedTime));
      const openedAt = new Date(parseInt(bybitPos.createdTime));

      const exists = existingHistory.some((existing) => {
        const isSameSymbol = existing.symbol === bybitPos.symbol;
        const isSameSide = existing.side === bybitPos.side;
        const isSimilarEntry = Math.abs(existing.entryPrice - entryPrice) < entryPrice * 0.001; // 0.1% tolerance (increased)
        const isSameCloseTime = 
          existing.closedAt && 
          Math.abs(new Date(existing.closedAt).getTime() - closedAt.getTime()) < 300000; // 5 min tolerance (increased)

        return isSameSymbol && isSameSide && isSimilarEntry && isSameCloseTime;
      });

      if (exists) {
        skipped++;
        continue;
      }

      // ✅ POPRAWKA: Oblicz ROE (pnlPercent po dźwigni)
      const positionValue = qty * entryPrice;
      const initialMargin = positionValue / leverage;
      const pnlPercent = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;

      // Duration in minutes
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);

      // Determine close reason based on PnL
      let closeReason = "closed_on_exchange";
      if (pnl > 0) {
        closeReason = "tp_main_hit";
      } else if (pnl < 0) {
        closeReason = "sl_hit";
      }

      // Insert into history
      await db.insert(positionHistory).values({
        positionId: null,
        alertId: null,
        symbol: bybitPos.symbol,
        side: bybitPos.side,
        tier: "Standard", // Default tier for imported positions
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

    console.log(`[Import Bybit History] Complete: ${imported} imported, ${skipped} skipped out of ${allPositions.length} total`);

    return NextResponse.json({
      success: true,
      message: `Import complete: ${imported} positions imported, ${skipped} already in history`,
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