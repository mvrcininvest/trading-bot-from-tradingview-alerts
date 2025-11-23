import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { positionHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

    // Fetch closed PnL history from Bybit
    const timestamp = Date.now();
    const startTime = timestamp - daysBack * 24 * 60 * 60 * 1000;
    
    const params: Record<string, any> = {
      category: "linear",
      startTime: startTime.toString(),
      endTime: timestamp.toString(),
      limit: 100,
    };

    const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);

    const queryString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;

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
      console.error("[Import Bybit History] API error:", data.retMsg);
      return NextResponse.json(
        { success: false, message: `Bybit API error: ${data.retMsg}` },
        { status: 400 }
      );
    }

    const bybitPositions: BybitHistoryPosition[] = data.result?.list || [];
    console.log(`[Import Bybit History] Found ${bybitPositions.length} positions on Bybit`);

    if (bybitPositions.length === 0) {
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

    for (const bybitPos of bybitPositions) {
      const entryPrice = parseFloat(bybitPos.avgEntryPrice);
      const exitPrice = parseFloat(bybitPos.avgExitPrice);
      const qty = parseFloat(bybitPos.qty);
      const pnl = parseFloat(bybitPos.closedPnl);
      const leverage = parseInt(bybitPos.leverage);

      // Check if position already exists in history (match by symbol, side, entry price, close time)
      const closedAt = new Date(parseInt(bybitPos.updatedTime));
      const openedAt = new Date(parseInt(bybitPos.createdTime));

      const exists = existingHistory.some((existing) => {
        const isSameSymbol = existing.symbol === bybitPos.symbol;
        const isSameSide = existing.side === bybitPos.side;
        const isSimilarEntry = Math.abs(existing.entryPrice - entryPrice) < entryPrice * 0.0001; // 0.01% tolerance
        const isSameCloseTime = 
          existing.closedAt && 
          Math.abs(new Date(existing.closedAt).getTime() - closedAt.getTime()) < 60000; // 1 min tolerance

        return isSameSymbol && isSameSide && isSimilarEntry && isSameCloseTime;
      });

      if (exists) {
        console.log(`[Import] Skipping ${bybitPos.symbol} - already in history`);
        skipped++;
        continue;
      }

      // Calculate PnL percentage
      const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100 * (bybitPos.side === "Buy" ? 1 : -1);

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
        positionId: 0, // No bot position ID for imported positions
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
        status: "closed",
      });

      console.log(
        `[Import] ✅ Imported ${bybitPos.symbol} ${bybitPos.side} - PnL: ${pnl.toFixed(2)} USDT`
      );
      imported++;
    }

    console.log(`[Import Bybit History] Complete: ${imported} imported, ${skipped} skipped`);

    return NextResponse.json({
      success: true,
      message: `Import complete: ${imported} positions imported, ${skipped} skipped`,
      imported,
      skipped,
      total: bybitPositions.length,
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
