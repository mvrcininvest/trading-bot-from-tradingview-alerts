import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botSettings } from "@/db/schema";
import crypto from "crypto";

// ============================================
// 🔐 BYBIT V5 SIGNATURE HELPER (FIXED)
// ============================================

function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  queryString: string
): string {
  // Bybit V5 format: timestamp + apiKey + recvWindow + queryString
  const message = timestamp + apiKey + recvWindow + queryString;
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
  const maxPages = 50;

  console.log(`[Bybit Stats] Fetching closed positions from ${new Date(startTime).toISOString()}`);

  do {
    pageCount++;
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    
    // Build query params
    const params: Record<string, string> = {
      category: "linear",
      startTime: startTime.toString(),
      endTime: now.toString(),
      limit: "100",
    };
    
    if (cursor) {
      params.cursor = cursor;
    }
    
    // Sort keys alphabetically and build query string
    const queryString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    
    const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
    
    const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;
    
    console.log(`[Bybit Stats] Page ${pageCount} request:`, {
      url: url.substring(0, 60) + "...",
      timestamp,
      hasSignature: !!signature
    });
    
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
    
    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error(`[Bybit Stats] Non-JSON response:`, text.substring(0, 200));
      throw new Error(`Bybit API returned non-JSON response. Status: ${response.status}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Bybit Stats] HTTP ${response.status}:`, errorText.substring(0, 500));
      throw new Error(`Bybit API HTTP error ${response.status}: ${errorText.substring(0, 100)}`);
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      console.error(`[Bybit Stats] Bybit error:`, data);
      throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'} (code: ${data.retCode})`);
    }
    
    const positions = data.result?.list || [];
    allPositions = [...allPositions, ...positions];
    
    console.log(`[Bybit Stats] Page ${pageCount}: ${positions.length} positions (total: ${allPositions.length})`);
    
    cursor = data.result?.nextPageCursor || null;
    
    if (pageCount >= maxPages) {
      console.log(`[Bybit Stats] Reached max pages (${maxPages})`);
      break;
    }
  } while (cursor);
  
  console.log(`[Bybit Stats] ✅ Total fetched: ${allPositions.length} closed positions`);
  return allPositions;
}

// ============================================
// 📊 GET WALLET BALANCE FROM BYBIT
// ============================================

async function getWalletBalance(apiKey: string, apiSecret: string) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const queryString = "accountType=UNIFIED";
  
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
  
  const url = `https://api.bybit.com/v5/account/wallet-balance?${queryString}`;
  
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
  
  const params: Record<string, string> = {
    category: "linear",
    settleCoin: "USDT"
  };
  
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
  
  const url = `https://api.bybit.com/v5/position/list?${queryString}`;
  
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
  const totalPnL = realisedPnL + unrealisedPnL;
  
  const totalTrades = closedPositions.length;
  const winningTrades = closedPositions.filter(p => parseFloat(p.closedPnl) > 0).length;
  const losingTrades = closedPositions.filter(p => parseFloat(p.closedPnl) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  const wins = closedPositions.filter(p => parseFloat(p.closedPnl) > 0);
  const losses = closedPositions.filter(p => parseFloat(p.closedPnl) < 0);
  
  const totalWins = wins.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0);
  const totalLosses = Math.abs(losses.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
  
  const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
  
  const pnls = closedPositions.map(p => parseFloat(p.closedPnl));
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
  
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
  
  // Time-based stats
  const now = Date.now();
  const last7Days = closedPositions.filter(p => {
    const closedTime = parseInt(p.updatedTime);
    return (now - closedTime) <= 7 * 24 * 60 * 60 * 1000;
  });
  
  const last30Days = closedPositions.filter(p => {
    const closedTime = parseInt(p.updatedTime);
    return (now - closedTime) <= 30 * 24 * 60 * 60 * 1000;
  });
  
  // Symbol stats (top 15)
  const symbolMap = new Map<string, {
    totalTrades: number;
    winningTrades: number;
    totalPnL: number;
    volume: number;
  }>();
  
  closedPositions.forEach(p => {
    const symbol = p.symbol;
    const pnl = parseFloat(p.closedPnl || "0");
    const qty = parseFloat(p.qty || "0");
    const avgPrice = parseFloat(p.avgEntryPrice || "0");
    const volume = qty * avgPrice;
    
    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, { totalTrades: 0, winningTrades: 0, totalPnL: 0, volume: 0 });
    }
    
    const stats = symbolMap.get(symbol)!;
    stats.totalTrades++;
    if (pnl > 0) stats.winningTrades++;
    stats.totalPnL += pnl;
    stats.volume += volume;
  });
  
  const symbolStats = Array.from(symbolMap.entries())
    .map(([symbol, stats]) => ({
      symbol,
      totalTrades: stats.totalTrades,
      winRate: (stats.winningTrades / stats.totalTrades) * 100,
      avgPnL: stats.totalPnL / stats.totalTrades,
      totalPnL: stats.totalPnL,
      volume: stats.volume,
    }))
    .sort((a, b) => b.totalPnL - a.totalPnL)
    .slice(0, 15);
  
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
    bestTrade,
    worstTrade,
    avgWin,
    avgLoss,
    profitFactor,
    tradingVolume,
    avgHoldingTime,
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
    last7Days: {
      totalTrades: last7Days.length,
      winRate: last7Days.length > 0 
        ? (last7Days.filter(p => parseFloat(p.closedPnl) > 0).length / last7Days.length) * 100 
        : 0,
      totalPnL: last7Days.reduce((sum, p) => sum + parseFloat(p.closedPnl || "0"), 0),
    },
    last30Days: {
      totalTrades: last30Days.length,
      winRate: last30Days.length > 0 
        ? (last30Days.filter(p => parseFloat(p.closedPnl) > 0).length / last30Days.length) * 100 
        : 0,
      totalPnL: last30Days.reduce((sum, p) => sum + parseFloat(p.closedPnl || "0"), 0),
    },
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
    
    if (isNaN(daysBack) || daysBack <= 0 || daysBack > 365) {
      return NextResponse.json(
        { success: false, message: "Days must be between 1 and 365" },
        { status: 400 }
      );
    }
    
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json(
        { success: false, message: "No Bybit API credentials configured" },
        { status: 400 }
      );
    }
    
    const { apiKey, apiSecret } = settings[0];
    
    console.log(`[Bybit Stats] 🚀 Starting fetch for last ${daysBack} days...`);
    
    const [closedPositions, openPositions, balance] = await Promise.all([
      getAllClosedPnL(apiKey!, apiSecret!, daysBack),
      getOpenPositions(apiKey!, apiSecret!),
      getWalletBalance(apiKey!, apiSecret!),
    ]);
    
    console.log(`[Bybit Stats] ✅ Data fetched successfully`);
    console.log(`[Bybit Stats] - Closed: ${closedPositions.length}`);
    console.log(`[Bybit Stats] - Open: ${openPositions.length}`);
    console.log(`[Bybit Stats] - Balance: ${balance.totalEquity} USDT`);
    
    const stats = calculateBybitStatistics(closedPositions, openPositions, balance);
    
    return NextResponse.json({
      success: true,
      stats,
      dataSource: "bybit",
      daysBack,
      fetchedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error("[Bybit Stats] ❌ Error:", error);
    
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}