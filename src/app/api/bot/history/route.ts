import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory, botSettings } from '@/db/schema';
import { desc } from 'drizzle-orm';
import crypto from 'crypto';

// ✅ USE PROXY URL FROM ENV
const BYBIT_PROXY_URL = process.env.BYBIT_PROXY_URL || "https://bybit-proxy-dawn-snowflake-6188.fly.dev/proxy/bybit";

// ============================================
// 🔐 BYBIT SIGNATURE HELPER
// ============================================

function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  queryString: string
): string {
  const message = timestamp + apiKey + recvWindow + queryString;
  return crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
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
  console.log(`[History API] Using proxy: ${BYBIT_PROXY_URL}`);
  
  const now = Date.now();
  const startTime = now - daysBack * 24 * 60 * 60 * 1000;
  
  let allPositions: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = Math.ceil(limit / 100);

  try {
    do {
      pageCount++;
      const timestamp = Date.now().toString();
      const recvWindow = "5000";
      
      const params: Record<string, string> = {
        category: "linear",
        startTime: startTime.toString(),
        endTime: now.toString(),
        limit: "100",
      };
      
      if (cursor) {
        params.cursor = cursor;
      }
      
      const queryString = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&");
      
      const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
      
      const url = `${BYBIT_PROXY_URL}/v5/position/closed-pnl?${queryString}`;
      
      console.log(`[History API] Request URL: ${url}`);
      
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
        // ✅ LOG FULL ERROR RESPONSE
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
      
      if (allPositions.length >= limit || pageCount >= maxPages) {
        break;
      }
    } while (cursor);
    
    console.log(`[History API] ✅ Fetched ${allPositions.length} positions from Bybit`);
    
    // Transform Bybit data to our format
    const formattedHistory = allPositions.slice(0, limit).map((pos) => {
      const entryPrice = parseFloat(pos.avgEntryPrice);
      const exitPrice = parseFloat(pos.avgExitPrice);
      const qty = parseFloat(pos.qty);
      const pnl = parseFloat(pos.closedPnl);
      const leverage = parseInt(pos.leverage);
      
      const closedAt = new Date(parseInt(pos.updatedTime));
      const openedAt = new Date(parseInt(pos.createdTime));
      
      const positionValue = qty * entryPrice;
      const initialMargin = positionValue / leverage;
      const pnlPercent = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
      
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      
      let closeReason = "closed_on_exchange";
      if (pnl > 0) {
        closeReason = "tp_hit";
      } else if (pnl < 0) {
        closeReason = "sl_hit";
      }
      
      return {
        id: pos.orderId,
        positionId: null,
        alertId: null,
        symbol: pos.symbol,
        side: pos.side,
        tier: "Real",
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
        source: "bybit" as const,
      };
    });
    
    return {
      success: true,
      history: formattedHistory,
      total: allPositions.length,
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
  
  // Check which TP was hit based on flags
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