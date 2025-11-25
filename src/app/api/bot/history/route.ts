import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory, botSettings } from '@/db/schema';
import { desc } from 'drizzle-orm';

// ✅ DIRECT BYBIT API REQUESTS (no proxy needed)
// Vercel will route these from Singapore/Hong Kong Edge regions
export const runtime = 'edge';
export const preferredRegion = ['sin1', 'hkg1', 'icn1']; // Singapore, Hong Kong, Seoul

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
  
  // Use Web Crypto API (Edge Runtime compatible)
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
// 📊 FETCH FROM BYBIT API (REAL DATA)
// ============================================

async function fetchFromBybitAPI(
  apiKey: string,
  apiSecret: string,
  limit: number,
  daysBack: number = 90
) {
  console.log(`[History API] 🌐 Fetching REAL data from Bybit API (last ${daysBack} days)...`);
  
  // ✅ CRITICAL FIX: Bybit has 7-day limit for closed-pnl endpoint
  // Divide time range into 7-day segments
  const now = Date.now();
  const totalMs = daysBack * 24 * 60 * 60 * 1000;
  const segmentMs = 7 * 24 * 60 * 60 * 1000; // 7 days max
  
  const segments: Array<{ start: number; end: number }> = [];
  let currentStart = now - totalMs;
  
  while (currentStart < now) {
    const currentEnd = Math.min(currentStart + segmentMs, now);
    segments.push({ start: currentStart, end: currentEnd });
    currentStart = currentEnd;
  }
  
  console.log(`[History API] Created ${segments.length} segments of max 7 days each`);
  
  let allPositions: any[] = [];

  try {
    // Fetch each 7-day segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentStartDate = new Date(segment.start).toISOString().split('T')[0];
      const segmentEndDate = new Date(segment.end).toISOString().split('T')[0];
      
      console.log(`[History API] Fetching segment ${i + 1}/${segments.length}: ${segmentStartDate} to ${segmentEndDate}`);
      
      let cursor: string | null = null;
      let pageCount = 0;
      const maxPagesPerSegment = 10;

      do {
        pageCount++;
        const timestamp = Date.now().toString();
        const recvWindow = "5000";
        
        const params: Record<string, string> = {
          category: "linear",
          startTime: segment.start.toString(),
          endTime: segment.end.toString(),
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
          console.error(`[History API] ❌ Bybit ${response.status} Error:`, errorText);
          throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.retCode !== 0) {
          console.error(`[History API] ❌ Bybit retCode error:`, data);
          throw new Error(`Bybit API error: ${data.retMsg} (code: ${data.retCode})`);
        }
        
        const positions = data.result?.list || [];
        allPositions = [...allPositions, ...positions];
        
        cursor = data.result?.nextPageCursor || null;
        
        if (pageCount >= maxPagesPerSegment) {
          console.log(`[History API] ⚠️ Reached page limit for segment ${i + 1}`);
          break;
        }
      } while (cursor);
      
      console.log(`[History API] Segment ${i + 1}: fetched ${allPositions.length} positions so far`);
      
      // Stop if we have enough positions
      if (allPositions.length >= limit * 3) { // Fetch more since we'll aggregate
        break;
      }
    }
    
    console.log(`[History API] ✅ Fetched ${allPositions.length} total positions from Bybit (including partial closes)`);
    
    // ============================================
    // 🔗 AGGREGATE PARTIAL CLOSES
    // ============================================
    console.log(`[History API] 🔗 Aggregating partial closes...`);
    
    // Group by symbol + createdTime (same position base)
    const positionGroups = new Map<string, any[]>();
    
    allPositions.forEach((pos) => {
      const groupKey = `${pos.symbol}_${pos.side}_${pos.createdTime}`;
      
      if (!positionGroups.has(groupKey)) {
        positionGroups.set(groupKey, []);
      }
      
      positionGroups.get(groupKey)!.push(pos);
    });
    
    console.log(`[History API] Found ${positionGroups.size} unique positions (aggregated from ${allPositions.length} records)`);
    
    // Transform and aggregate
    const formattedHistory: any[] = [];
    
    positionGroups.forEach((group, groupKey) => {
      // Sort by updatedTime to get chronological order
      group.sort((a, b) => parseInt(a.updatedTime) - parseInt(b.updatedTime));
      
      // Aggregate data
      const firstClose = group[0];
      const lastClose = group[group.length - 1];
      
      const totalQty = group.reduce((sum, p) => sum + parseFloat(p.qty), 0);
      const totalPnl = group.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0);
      
      // Calculate weighted average exit price
      const weightedExitSum = group.reduce((sum, p) => {
        return sum + (parseFloat(p.avgExitPrice) * parseFloat(p.qty));
      }, 0);
      const avgExitPrice = totalQty > 0 ? weightedExitSum / totalQty : 0;
      
      const entryPrice = parseFloat(firstClose.avgEntryPrice);
      const leverage = parseInt(firstClose.leverage);
      
      const closedAt = new Date(parseInt(lastClose.updatedTime));
      const openedAt = new Date(parseInt(firstClose.createdTime));
      
      const positionValue = totalQty * entryPrice;
      const initialMargin = positionValue / leverage;
      const pnlPercent = initialMargin > 0 ? (totalPnl / initialMargin) * 100 : 0;
      
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      
      // ✅ DETERMINE WHICH TPs WERE HIT based on partial close count
      const partialCloseCount = group.length;
      let tp1Hit = false;
      let tp2Hit = false;
      let tp3Hit = false;
      let closeReason = "closed_on_exchange";
      
      if (totalPnl > 0) {
        // Profitable - assume TPs hit in order
        if (partialCloseCount >= 3) {
          tp1Hit = tp2Hit = tp3Hit = true;
          closeReason = "tp3_hit";
        } else if (partialCloseCount === 2) {
          tp1Hit = tp2Hit = true;
          closeReason = "tp2_hit";
        } else if (partialCloseCount === 1) {
          tp1Hit = true;
          closeReason = "tp1_hit";
        }
      } else if (totalPnl < 0) {
        closeReason = "sl_hit";
      }
      
      formattedHistory.push({
        id: firstClose.orderId,
        positionId: null,
        alertId: null,
        symbol: firstClose.symbol,
        side: firstClose.side,
        tier: "Real",
        entryPrice,
        closePrice: avgExitPrice,
        quantity: totalQty,
        leverage,
        pnl: totalPnl,
        pnlPercent,
        closeReason,
        tp1Hit,
        tp2Hit,
        tp3Hit,
        partialCloseCount,
        confirmationCount: 0,
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        durationMinutes,
        source: "bybit" as const,
      });
    });
    
    // Sort by closedAt desc
    formattedHistory.sort((a, b) => 
      new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
    );
    
    const limitedHistory = formattedHistory.slice(0, limit);
    
    console.log(`[History API] ✅ Aggregated to ${formattedHistory.length} positions (showing ${limitedHistory.length})`);
    
    return {
      success: true,
      history: limitedHistory,
      total: formattedHistory.length,
      source: "bybit" as const,
    };
    
  } catch (error) {
    console.error("[History API] ❌ Bybit API failed:", error);
    throw error;
  }
}

// ============================================
// 🔥 ENHANCED CLOSE REASON CLASSIFIER
// ============================================

function classifyCloseReason(position: any): string {
  const pnl = typeof position.pnl === 'number' ? position.pnl : parseFloat(position.pnl || "0");
  
  if (pnl > 0) {
    if (position.tp3Hit) return 'tp3_hit';
    if (position.tp2Hit) return 'tp2_hit';
    if (position.tp1Hit) return 'tp1_hit';
    return 'tp_main_hit';
  }

  if (pnl < 0) {
    return 'sl_hit';
  }

  return 'closed_on_exchange';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse source parameter (database or bybit)
    const source = searchParams.get('source') || 'database';
    
    // Parse and validate pagination parameters
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const daysBackParam = searchParams.get('daysBack');
    
    let limit = 50;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        return NextResponse.json({ 
          error: 'Limit must be a positive integer',
          code: 'INVALID_LIMIT' 
        }, { status: 400 });
      }
      limit = Math.min(parsedLimit, 200);
    }

    let offset = 0;
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return NextResponse.json({ 
          error: 'Offset must be a non-negative integer',
          code: 'INVALID_OFFSET' 
        }, { status: 400 });
      }
      offset = parsedOffset;
    }
    
    let daysBack = 90;
    if (daysBackParam) {
      const parsedDays = parseInt(daysBackParam);
      if (!isNaN(parsedDays) && parsedDays > 0) {
        daysBack = Math.min(parsedDays, 365);
      }
    }

    // ✅ FETCH FROM BYBIT API (REAL DATA)
    if (source === 'bybit') {
      const settings = await db.select().from(botSettings).limit(1);
      
      if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
        return NextResponse.json({
          success: false,
          message: "Brak konfiguracji API Bybit. Skonfiguruj klucze w ustawieniach.",
          code: "NO_CREDENTIALS"
        }, { status: 400 });
      }
      
      const { apiKey, apiSecret } = settings[0];
      
      try {
        const result = await fetchFromBybitAPI(apiKey!, apiSecret!, limit, daysBack);
        
        // Calculate statistics
        const totalPnl = result.history.reduce((sum, p) => sum + p.pnl, 0);
        const avgPnl = result.history.length > 0 ? totalPnl / result.history.length : 0;
        const profitableCount = result.history.filter(p => p.pnl > 0).length;
        const totalCount = result.history.length;
        const winRate = totalCount > 0 ? (profitableCount / totalCount) * 100 : 0;
        
        return NextResponse.json({
          success: true,
          history: result.history,
          total: result.total,
          limit,
          offset: 0,
          source: "bybit",
          daysBack,
          stats: {
            totalPnl: Math.round(totalPnl * 100) / 100,
            avgPnl: Math.round(avgPnl * 100) / 100,
            winRate: Math.round(winRate * 100) / 100,
            totalPositions: totalCount
          }
        }, { status: 200 });
      } catch (error) {
        console.error("[History API] Bybit fetch failed:", error);
        return NextResponse.json({
          success: false,
          message: `Nie udało się pobrać danych z Bybit: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: "BYBIT_API_ERROR"
        }, { status: 500 });
      }
    }

    // ✅ FETCH FROM LOCAL DATABASE (DEFAULT)
    console.log("[History API] Fetching closed positions from local database...");
    
    const historyRecords = await db
      .select()
      .from(positionHistory)
      .orderBy(desc(positionHistory.closedAt))
      .limit(limit)
      .offset(offset);

    console.log(`[History API] ✅ Fetched ${historyRecords.length} positions from database`);

    // Transform database records to API format
    const formattedHistory = historyRecords.map((record) => ({
      id: record.id,
      positionId: record.positionId,
      alertId: record.alertId,
      symbol: record.symbol,
      side: record.side,
      tier: record.tier,
      entryPrice: record.entryPrice,
      closePrice: record.closePrice,
      quantity: record.quantity,
      leverage: record.leverage,
      pnl: record.pnl,
      pnlPercent: record.pnlPercent,
      closeReason: record.closeReason,
      tp1Hit: record.tp1Hit,
      tp2Hit: record.tp2Hit,
      tp3Hit: record.tp3Hit,
      confirmationCount: record.confirmationCount,
      openedAt: record.openedAt,
      closedAt: record.closedAt,
      durationMinutes: record.durationMinutes,
      source: "database" as const,
    }));

    // Get total count for pagination
    const totalRecords = await db
      .select()
      .from(positionHistory);

    // Calculate statistics
    const totalPnl = formattedHistory.reduce((sum, p) => sum + p.pnl, 0);
    const avgPnl = formattedHistory.length > 0 ? totalPnl / formattedHistory.length : 0;
    const profitableCount = formattedHistory.filter(p => p.pnl > 0).length;
    const totalCount = formattedHistory.length;
    const winRate = totalCount > 0 ? (profitableCount / totalCount) * 100 : 0;

    return NextResponse.json({
      success: true,
      history: formattedHistory,
      total: totalRecords.length,
      limit,
      offset,
      source: "database",
      stats: {
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgPnl: Math.round(avgPnl * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        totalPositions: totalCount
      }
    }, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}