import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botSettings } from "@/db/schema";
import crypto from "crypto";

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
  const maxPages = 50; // Safety limit

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
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg}`);
    }
    
    const positions = data.result?.list || [];
    allPositions = [...allPositions, ...positions];
    
    cursor = data.result?.nextPageCursor || null;
    
    console.log(`[Bybit Stats] Page ${pageCount}: ${positions.length} positions, Total: ${allPositions.length}`);
    
    if (pageCount >= maxPages) {
      console.log(`[Bybit Stats] Reached safety limit of ${maxPages} pages`);
      break;
    }
  } while (cursor);
  
  console.log(`[Bybit Stats] ✅ Fetched ${allPositions.length} total positions from Bybit`);
  
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
  // Total realised PnL from closed positions
  const realisedPnL = closedPositions.reduce((sum, p) => sum + parseFloat(p.closedPnl || "0"), 0);
  
  // Unrealised PnL from open positions
  const unrealisedPnL = openPositions.reduce((sum, p) => sum + parseFloat(p.unrealisedPnl || "0"), 0);
  
  // Total PnL
  const totalPnL = realisedPnL + unrealisedPnL;
  
  // Trade counts
  const totalTrades = closedPositions.length;
  const winningTrades = closedPositions.filter(p => parseFloat(p.closedPnl) > 0).length;
  const losingTrades = closedPositions.filter(p => parseFloat(p.closedPnl) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  // Best and worst trades
  const pnls = closedPositions.map(p => parseFloat(p.closedPnl || "0"));
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
  
  // Average win/loss
  const wins = closedPositions.filter(p => parseFloat(p.closedPnl) > 0);
  const losses = closedPositions.filter(p => parseFloat(p.closedPnl) < 0);
  
  const avgWin = wins.length > 0 
    ? wins.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0) / wins.length 
    : 0;
  
  const totalLossSum = losses.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0);
  const avgLoss = losses.length > 0 ? Math.abs(totalLossSum / losses.length) : 0;
  
  // Profit Factor
  const totalWins = wins.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0);
  const totalLosses = Math.abs(losses.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
  
  // Trading volume
  const tradingVolume = closedPositions.reduce((sum, p) => {
    const qty = parseFloat(p.qty || "0");
    const avgPrice = parseFloat(p.avgEntryPrice || "0");
    return sum + (qty * avgPrice);
  }, 0);
  
  // Average holding time (in minutes)
  const avgHoldingTime = totalTrades > 0
    ? closedPositions.reduce((sum, p) => {
        const created = parseInt(p.createdTime);
        const updated = parseInt(p.updatedTime);
        return sum + ((updated - created) / 1000 / 60);
      }, 0) / totalTrades
    : 0;
  
  // Time-based stats
  const now = Date.now();
  const last7Days = closedPositions.filter(p => (now - parseInt(p.updatedTime)) <= 7 * 24 * 60 * 60 * 1000);
  const last30Days = closedPositions.filter(p => (now - parseInt(p.updatedTime)) <= 30 * 24 * 60 * 60 * 1000);
  
  const last7DaysStats = {
    totalTrades: last7Days.length,
    winRate: last7Days.length > 0 ? (last7Days.filter(p => parseFloat(p.closedPnl) > 0).length / last7Days.length) * 100 : 0,
    totalPnL: last7Days.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0),
  };
  
  const last30DaysStats = {
    totalTrades: last30Days.length,
    winRate: last30Days.length > 0 ? (last30Days.filter(p => parseFloat(p.closedPnl) > 0).length / last30Days.length) * 100 : 0,
    totalPnL: last30Days.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0),
  };
  
  // Symbol-based stats
  const symbolMap = new Map<string, { wins: number; total: number; pnl: number; volume: number }>();
  closedPositions.forEach(p => {
    const symbol = p.symbol;
    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, { wins: 0, total: 0, pnl: 0, volume: 0 });
    }
    const data = symbolMap.get(symbol)!;
    data.total++;
    const pnl = parseFloat(p.closedPnl);
    if (pnl > 0) data.wins++;
    data.pnl += pnl;
    data.volume += parseFloat(p.qty) * parseFloat(p.avgEntryPrice);
  });
  
  const symbolStats = Array.from(symbolMap.entries())
    .map(([symbol, data]) => ({
      symbol,
      totalTrades: data.total,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl,
      volume: data.volume,
    }))
    .sort((a, b) => b.totalPnL - a.totalPnL)
    .slice(0, 15); // Top 15 symbols
  
  return {
    // Account metrics
    totalEquity: balance.totalEquity,
    totalWalletBalance: balance.totalWalletBalance,
    availableBalance: balance.totalAvailableBalance,
    
    // PnL metrics
    realisedPnL,
    unrealisedPnL,
    totalPnL,
    
    // Trading metrics
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    bestTrade,
    worstTrade,
    avgWin,
    avgLoss,
    profitFactor,
    tradingVolume,
    avgHoldingTime,
    
    // Open positions
    openPositionsCount: openPositions.length,
    openPositions: openPositions.map((p: any) => ({
      symbol: p.symbol,
      side: p.side,
      size: parseFloat(p.size),
      leverage: parseFloat(p.leverage),
      unrealisedPnl: parseFloat(p.unrealisedPnl),
      entryPrice: parseFloat(p.avgPrice),
      markPrice: parseFloat(p.markPrice),
    })),
    
    // Time-based
    last7Days: last7DaysStats,
    last30Days: last30DaysStats,
    
    // Symbol breakdown
    symbolStats,
  };
}

// ============================================
// 📊 GET ENDPOINT - FETCH BYBIT STATS
// ============================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const daysBack = parseInt(searchParams.get("days") || "90");
    
    // Validate days parameter
    if (isNaN(daysBack) || daysBack <= 0 || daysBack > 365) {
      return NextResponse.json(
        { success: false, message: "Days must be between 1 and 365" },
        { status: 400 }
      );
    }
    
    // Get API credentials from database
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json(
        { success: false, message: "Bybit API credentials not configured" },
        { status: 400 }
      );
    }
    
    const { apiKey, apiSecret } = settings[0];
    
    console.log(`[Bybit Stats] Fetching data for last ${daysBack} days...`);
    
    // Fetch all data from Bybit
    const [closedPositions, openPositions, balance] = await Promise.all([
      getAllClosedPnL(apiKey!, apiSecret!, daysBack),
      getOpenPositions(apiKey!, apiSecret!),
      getWalletBalance(apiKey!, apiSecret!),
    ]);
    
    console.log(`[Bybit Stats] Data fetched: ${closedPositions.length} closed, ${openPositions.length} open positions`);
    
    // Calculate statistics
    const stats = calculateBybitStatistics(closedPositions, openPositions, balance);
    
    return NextResponse.json({
      success: true,
      stats,
      dataSource: "bybit",
      daysBack,
      fetchedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error("[Bybit Stats] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
