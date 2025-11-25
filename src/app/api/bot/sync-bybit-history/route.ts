import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { positionHistory, botSettings } from "@/db/schema";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * 🔄 FULL BYBIT HISTORY SYNC
 * 
 * This endpoint:
 * 1. Deletes ALL positions from local database
 * 2. Imports fresh history from Bybit (last 30 days)
 * 3. Returns count of imported positions
 */

// ============================================
// 🔐 BYBIT SIGNATURE HELPER (Web Crypto API)
// ============================================

async function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  queryString: string
): Promise<string> {
  const message = timestamp + apiKey + recvWindow + queryString;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

// ============================================
// 🔍 FILTER OUT FUNDING TRANSACTIONS
// ============================================

/**
 * Determines if a Bybit closed position is a real trade or a funding transaction
 * 
 * Funding transactions have these characteristics:
 * 1. Very short duration (< 10 seconds)
 * 2. Entry price ≈ Exit price (no real price movement)
 * 3. Often minimal or zero quantity
 */
function isRealPosition(bybitPos: any): boolean {
  try {
    const entryPrice = parseFloat(bybitPos.avgEntryPrice);
    const exitPrice = parseFloat(bybitPos.avgExitPrice);
    const qty = parseFloat(bybitPos.qty);
    
    // Calculate duration
    const openedAt = new Date(parseInt(bybitPos.createdTime));
    const closedAt = new Date(parseInt(bybitPos.updatedTime));
    const durationMs = closedAt.getTime() - openedAt.getTime();
    const durationSeconds = durationMs / 1000;
    
    // Calculate price difference
    const priceDiff = Math.abs(entryPrice - exitPrice);
    const priceDiffPercent = entryPrice > 0 ? (priceDiff / entryPrice) * 100 : 0;
    
    // Funding transactions typically have:
    // - Duration < 10 seconds
    // - Price difference < 0.01% (essentially no movement)
    // - These are NOT real positions, just funding fee settlements
    
    const isFundingTransaction = durationSeconds < 10 && priceDiffPercent < 0.01;
    
    if (isFundingTransaction) {
      console.log(`   🚫 FILTERED: ${bybitPos.symbol} - Funding transaction (${durationSeconds.toFixed(1)}s, ${priceDiffPercent.toFixed(4)}% price diff)`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`   ⚠️ Error checking position:`, error);
    return true; // Default to including if we can't determine
  }
}

// ============================================
// 📥 FETCH FROM BYBIT (7-DAY SEGMENTS)
// ============================================

async function fetchBybitHistorySegment(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number
): Promise<any[]> {
  let allPositions: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 10;

  do {
    pageCount++;
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    
    const params: Record<string, string> = {
      category: "linear",
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      limit: "100",
    };
    
    if (cursor) {
      params.cursor = cursor;
    }
    
    const queryString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    
    const signature = await createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
    
    const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg} (code: ${data.retCode})`);
    }
    
    const positions = data.result?.list || [];
    allPositions = [...allPositions, ...positions];
    
    cursor = data.result?.nextPageCursor || null;
    
    if (pageCount >= maxPages) {
      console.log(`[Sync] ⚠️ Reached page limit for segment`);
      break;
    }
  } while (cursor);
  
  return allPositions;
}

export async function POST(request: NextRequest) {
  try {
    console.log(`\n🔄 ========== FULL BYBIT SYNC START ==========`);
    
    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json({
        success: false,
        message: "Brak konfiguracji API Bybit. Skonfiguruj klucze w ustawieniach.",
      }, { status: 400 });
    }
    
    const { apiKey, apiSecret } = settings[0];
    
    // STEP 1: Delete ALL positions from database
    console.log(`\n🗑️ STEP 1: Deleting all positions from database...`);
    
    const deletedCount = await db.delete(positionHistory);
    
    console.log(`✅ Deleted all positions from database`);
    
    // STEP 2: Fetch history from Bybit (last 30 days, divided into 7-day segments)
    console.log(`\n📥 STEP 2: Fetching history from Bybit (last 30 days)...`);
    
    const daysBack = 30;
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
    
    console.log(`📊 Created ${segments.length} segments of max 7 days each`);
    
    let allPositions: any[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentStartDate = new Date(segment.start).toISOString().split('T')[0];
      const segmentEndDate = new Date(segment.end).toISOString().split('T')[0];
      
      console.log(`📥 Fetching segment ${i + 1}/${segments.length}: ${segmentStartDate} to ${segmentEndDate}`);
      
      try {
        const segmentPositions = await fetchBybitHistorySegment(
          apiKey!,
          apiSecret!,
          segment.start,
          segment.end
        );
        
        allPositions = [...allPositions, ...segmentPositions];
        console.log(`   ✅ Segment ${i + 1}: ${segmentPositions.length} positions (total: ${allPositions.length})`);
      } catch (error) {
        console.error(`   ❌ Segment ${i + 1} failed:`, error);
        // Continue with next segment
      }
    }
    
    console.log(`\n✅ Fetched ${allPositions.length} total positions from Bybit`);
    
    // ✅ NEW: Filter out funding transactions
    console.log(`\n🔍 STEP 2.5: Filtering out funding transactions...`);
    
    const realPositions = allPositions.filter(isRealPosition);
    const filteredCount = allPositions.length - realPositions.length;
    
    console.log(`   ✅ Filtered: ${realPositions.length} real positions, ${filteredCount} funding transactions removed`);
    
    if (realPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Brak pozycji w Bybit za ostatnie 30 dni",
        deleted: 0,
        imported: 0,
        filtered: filteredCount,
      });
    }
    
    // STEP 3: Import all positions to database
    console.log(`\n💾 STEP 3: Importing ${realPositions.length} positions to database...`);
    
    let imported = 0;
    
    for (const bybitPos of realPositions) {
      const entryPrice = parseFloat(bybitPos.avgEntryPrice);
      const exitPrice = parseFloat(bybitPos.avgExitPrice);
      const qty = parseFloat(bybitPos.qty);
      const pnl = parseFloat(bybitPos.closedPnl);
      const leverage = parseInt(bybitPos.leverage);
      
      const closedAt = new Date(parseInt(bybitPos.updatedTime));
      const openedAt = new Date(parseInt(bybitPos.createdTime));
      
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
    
    console.log(`✅ Imported ${imported} positions`);
    console.log(`\n🔄 ========== FULL BYBIT SYNC COMPLETE ==========\n`);
    
    return NextResponse.json({
      success: true,
      message: `✅ Synchronizacja zakończona: ${imported} pozycji z Bybit`,
      deleted: 0, // We don't track this anymore since we always delete all
      imported,
      daysBack: 30,
    });
    
  } catch (error) {
    console.error("[Sync Bybit History] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}