import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botSettings, positionHistory } from "@/db/schema";
import crypto from "crypto";
import { eq, gte, sql } from "drizzle-orm";

// ============================================
// 🔐 BYBIT SIGNATURE HELPER
// ============================================

function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  params: string
): string {
  const message = timestamp + apiKey + recvWindow + params;
  return crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
}

// ============================================
// 📊 GET STATS FROM LOCAL DATABASE (FALLBACK)
// ============================================

async function getStatsFromDatabase(daysBack: number = 90) {
  const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  
  // Fetch closed positions from database
  const closedPositions = await db
    .select()
    .from(positionHistory)
    .where(gte(positionHistory.closedAt, cutoffDate));
  
  // Calculate statistics
  const realisedPnL = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalTrades = closedPositions.length;
  const winningTrades = closedPositions.filter(p => (p.pnl || 0) > 0).length;
  const losingTrades = closedPositions.filter(p => (p.pnl || 0) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  // Profit factor
  const wins = closedPositions.filter(p => (p.pnl || 0) > 0);
  const losses = closedPositions.filter(p => (p.pnl || 0) < 0);
  const totalWins = wins.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalLosses = Math.abs(losses.reduce((sum, p) => sum + (p.pnl || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
  
  // Trading volume
  const tradingVolume = closedPositions.reduce((sum, p) => {
    const qty = p.quantity || 0;
    const price = p.entryPrice || 0;
    return sum + (qty * price);
  }, 0);
  
  // Average holding time
  const avgHoldingTime = totalTrades > 0
    ? closedPositions.reduce((sum, p) => sum + (p.durationMinutes || 0), 0) / totalTrades
    : 0;
  
  return {
    totalEquity: 0,
    totalWalletBalance: 0,
    availableBalance: 0,
    realisedPnL,
    unrealisedPnL: 0,
    totalPnL: realisedPnL,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    profitFactor,
    tradingVolume,
    avgHoldingTime,
  };
}

// ============================================
// 📊 GET CLOSED PNL FROM BYBIT (ALL PAGES)
// ============================================

async function getAllClosedPnL(
  apiKey: string,
  apiSecret: string,
  daysBack: number = 90
): Promise<any[]> {
  const now = Date.now();
  const startTime = now - daysBack * 24 * 60 * 60 * 1000;
  
  let allPositions: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 50;

  do {
    pageCount++;
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    
    const params: Record<string, any> = {
      category: "linear",
      startTime: startTime.toString(),
      endTime: now.toString(),
      limit: 100,
    };
    
    if (cursor) {
      params.cursor = cursor;
    }
    
    const queryString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    
    const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
    
    const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recvWindow,
      },
    });
    
    // ✅ NOWE: Sprawdź czy to błąd 403 (geo-blocking)
    if (response.status === 403) {
      const text = await response.text();
      if (text.includes('CloudFront') || text.includes('country')) {
        throw new Error('GEO_BLOCKED');
      }
      throw new Error(`Bybit API 403: ${text.substring(0, 200)}`);
    }
    
    if (!response.ok) {
      throw new Error(`Bybit API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    const positions = data.result?.list || [];
    allPositions = [...allPositions, ...positions];
    
    cursor = data.result?.nextPageCursor || null;
    
    if (pageCount >= maxPages) {
      break;
    }
  } while (cursor);
  
  return allPositions;
}

// ============================================
// 📊 GET WALLET BALANCE FROM BYBIT
// ============================================

async function getWalletBalance(apiKey: string, apiSecret: string) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = "accountType=UNIFIED";
  
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
  
  const url = `https://api.bybit.com/v5/account/wallet-balance?${params}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  });
  
  // ✅ NOWE: Sprawdź geo-blocking
  if (response.status === 403) {
    throw new Error('GEO_BLOCKED');
  }
  
  const data = await response.json();
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }
  
  const walletData = data.result?.list?.[0];
  if (!walletData) {
    return { totalEquity: 0, totalWalletBalance: 0, totalAvailableBalance: 0 };
  }
  
  return {
    totalEquity: parseFloat(walletData.totalEquity || "0"),
    totalWalletBalance: parseFloat(walletData.totalWalletBalance || "0"),
    totalAvailableBalance: parseFloat(walletData.totalAvailableBalance || "0"),
  };
}

// ============================================
// 📊 GET OPEN POSITIONS FROM BYBIT
// ============================================

async function getOpenPositions(apiKey: string, apiSecret: string) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = "category=linear&settleCoin=USDT";
  
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
  
  const url = `https://api.bybit.com/v5/position/list?${params}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  });
  
  // ✅ NOWE: Sprawdź geo-blocking
  if (response.status === 403) {
    throw new Error('GEO_BLOCKED');
  }
  
  const data = await response.json();
  
  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }
  
  const positions = data.result?.list || [];
  return positions.filter((p: any) => parseFloat(p.size) > 0);
}

// ============================================
// 📊 CALCULATE STATISTICS FROM BYBIT DATA
// ============================================

function calculateBybitStatistics(closedPositions: any[], openPositions: any[], balance: any) {
  const realisedPnL = closedPositions.reduce((sum, p) => sum + parseFloat(p.closedPnl || "0"), 0);
  const unrealisedPnL = openPositions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0);
  const totalPnL = realisedPnL + unrealisedPnl;
  
  const totalTrades = closedPositions.length;
  const winningTrades = closedPositions.filter(p => parseFloat(p.closedPnl) > 0).length;
  const losingTrades = closedPositions.filter(p => parseFloat(p.closedPnl) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  const wins = closedPositions.filter(p => parseFloat(p.closedPnl) > 0);
  const losses = closedPositions.filter(p => parseFloat(p.closedPnl) < 0);
  
  const totalWins = wins.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0);
  const totalLosses = Math.abs(losses.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
  
  const tradingVolume = closedPositions.reduce((sum, p) => {
    const qty = parseFloat(p.qty || "0");
    const avgPrice = parseFloat(p.avgEntryPrice || "0");
    return sum + (qty * avgPrice);
  }, 0);
  
  const avgHoldingTime = totalTrades > 0
    ? closedPositions.reduce((sum, p) => {
        const created = parseInt(p.createdTime);
        const updated = parseInt(p.updatedTime);
        return sum + ((updated - created) / 1000 / 60);
      }, 0) / totalTrades
    : 0;
  
  return {
    totalEquity: balance.totalEquity,
    totalWalletBalance: balance.totalWalletBalance,
    availableBalance: balance.totalAvailableBalance,
    realisedPnL,
    unrealisedPnL,
    totalPnL,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    profitFactor,
    tradingVolume,
    avgHoldingTime,
  };
}

// ============================================
// 📊 GET ENDPOINT - FETCH BYBIT STATS
// ============================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const daysBack = parseInt(searchParams.get("days") || "90");
    
    if (isNaN(daysBack) || daysBack <= 0 || daysBack > 365) {
      return NextResponse.json(
        { success: false, message: "Days must be between 1 and 365" },
        { status: 400 }
      );
    }
    
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      // ✅ Fallback na dane z bazy jeśli brak credentials
      console.log(`[Bybit Stats] No credentials - using database fallback`);
      const stats = await getStatsFromDatabase(daysBack);
      
      return NextResponse.json({
        success: true,
        stats,
        dataSource: "database",
        warning: "Bybit credentials not configured - using local data",
        daysBack,
        fetchedAt: new Date().toISOString(),
      });
    }
    
    const { apiKey, apiSecret } = settings[0];
    
    console.log(`[Bybit Stats] Fetching data for last ${daysBack} days...`);
    
    try {
      // Próbuj pobrać dane z Bybit
      const [closedPositions, openPositions, balance] = await Promise.all([
        getAllClosedPnL(apiKey!, apiSecret!, daysBack),
        getOpenPositions(apiKey!, apiSecret!),
        getWalletBalance(apiKey!, apiSecret!),
      ]);
      
      console.log(`[Bybit Stats] ✅ Data fetched: ${closedPositions.length} closed, ${openPositions.length} open positions`);
      
      const stats = calculateBybitStatistics(closedPositions, openPositions, balance);
      
      return NextResponse.json({
        success: true,
        stats,
        dataSource: "bybit",
        daysBack,
        fetchedAt: new Date().toISOString(),
      });
      
    } catch (bybitError) {
      // ✅ NOWY: Jeśli Bybit jest zablokowany, użyj fallback
      if (bybitError instanceof Error && bybitError.message === 'GEO_BLOCKED') {
        console.log(`[Bybit Stats] ⚠️ Bybit geo-blocked - falling back to database`);
        const stats = await getStatsFromDatabase(daysBack);
        
        return NextResponse.json({
          success: true,
          stats,
          dataSource: "database",
          warning: "Bybit API is geo-blocked on this server - using local data",
          daysBack,
          fetchedAt: new Date().toISOString(),
        });
      }
      
      // Inny błąd - przepuść dalej
      throw bybitError;
    }
    
  } catch (error) {
    console.error("[Bybit Stats] Error:", error);
    
    // ✅ OSTATNIA DESKA RATUNKU: Zawsze zwróć coś z bazy
    try {
      const daysBack = parseInt(request.nextUrl.searchParams.get("days") || "90");
      const stats = await getStatsFromDatabase(daysBack);
      
      return NextResponse.json({
        success: true,
        stats,
        dataSource: "database",
        warning: `Error fetching from Bybit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        daysBack,
        fetchedAt: new Date().toISOString(),
      });
    } catch (dbError) {
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  }
}