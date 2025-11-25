import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botSettings, positionHistory, botPositions } from "@/db/schema";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";

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
  const message = timestamp + apiKey + recvWindow + queryString;
  return crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
}

// ============================================
// 📊 FALLBACK: Calculate stats from LOCAL DATABASE
// ============================================

async function calculateStatsFromLocalDB(daysBack: number) {
  console.log(`[Bybit Stats] 🔄 FALLBACK: Using local database`);
  
  const now = Date.now();
  const startTime = now - daysBack * 24 * 60 * 60 * 1000;
  const startDate = new Date(startTime).toISOString();
  
  // Get closed positions from history
  const closedPositions = await db
    .select()
    .from(positionHistory)
    .where(sql`${positionHistory.closedAt} >= ${startDate}`);
  
  // Get open positions
  const openPositions = await db
    .select()
    .from(botPositions);
  
  console.log(`[Bybit Stats] Local DB: ${closedPositions.length} closed, ${openPositions.length} open`);
  
  // Calculate statistics
  const realisedPnL = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const unrealisedPnL = openPositions.reduce((sum, p) => {
    const current = p.currentPrice || p.entryPrice;
    const entryPrice = p.entryPrice;
    const qty = p.quantity;
    const side = p.side;
    
    const priceDiff = side === 'BUY' ? (current - entryPrice) : (entryPrice - current);
    return sum + (priceDiff * qty);
  }, 0);
  
  const totalPnL = realisedPnL + unrealisedPnL;
  
  const totalTrades = closedPositions.length;
  const winningTrades = closedPositions.filter(p => (p.pnl || 0) > 0).length;
  const losingTrades = closedPositions.filter(p => (p.pnl || 0) < 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  const wins = closedPositions.filter(p => (p.pnl || 0) > 0);
  const losses = closedPositions.filter(p => (p.pnl || 0) < 0);
  
  const totalWins = wins.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const totalLosses = Math.abs(losses.reduce((sum, p) => sum + (p.pnl || 0), 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
  
  const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
  
  const pnls = closedPositions.map(p => p.pnl || 0);
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
  
  const tradingVolume = closedPositions.reduce((sum, p) => {
    return sum + (p.quantity * p.entryPrice);
  }, 0);
  
  const avgHoldingTime = totalTrades > 0
    ? closedPositions.reduce((sum, p) => sum + (p.durationMinutes || 0), 0) / totalTrades
    : 0;
  
  // Time-based stats
  const last7DaysDate = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30DaysDate = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const last7Days = closedPositions.filter(p => p.closedAt && p.closedAt >= last7DaysDate);
  const last30Days = closedPositions.filter(p => p.closedAt && p.closedAt >= last30DaysDate);
  
  // Symbol stats (top 15)
  const symbolMap = new Map<string, {
    totalTrades: number;
    winningTrades: number;
    totalPnL: number;
    volume: number;
  }>();
  
  closedPositions.forEach(p => {
    const symbol = p.symbol;
    const pnl = p.pnl || 0;
    const volume = p.quantity * p.entryPrice;
    
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
    totalEquity: 0, // Not available from local DB
    totalWalletBalance: 0,
    availableBalance: 0,
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
    openPositions: openPositions.map(p => ({
      symbol: p.symbol,
      side: p.side,
      size: p.quantity,
      leverage: p.leverage || 1,
      unrealisedPnl: unrealisedPnL / (openPositions.length || 1), // Rough estimate
      entryPrice: p.entryPrice,
      markPrice: p.currentPrice || p.entryPrice,
    })),
    last7Days: {
      totalTrades: last7Days.length,
      winRate: last7Days.length > 0 
        ? (last7Days.filter(p => (p.pnl || 0) > 0).length / last7Days.length) * 100 
        : 0,
      totalPnL: last7Days.reduce((sum, p) => sum + (p.pnl || 0), 0),
    },
    last30Days: {
      totalTrades: last30Days.length,
      winRate: last30Days.length > 0 
        ? (last30Days.filter(p => (p.pnl || 0) > 0).length / last30Days.length) * 100 
        : 0,
      totalPnL: last30Days.reduce((sum, p) => sum + (p.pnl || 0), 0),
    },
    symbolStats,
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

  console.log(`[Bybit Stats] Fetching closed positions from ${new Date(startTime).toISOString()}`);

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
    
    const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;
    
    console.log(`[Bybit Stats] Page ${pageCount} request`);
    
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
    
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      
      // Check for CloudFront/geo-blocking errors
      if (text.includes("CloudFront") || text.includes("<!DOCTYPE html>")) {
        throw new Error("GEO_BLOCKED");
      }
      
      throw new Error(`Bybit API returned non-JSON response. Status: ${response.status}`);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Check for geo-blocking in error
      if (errorText.includes("CloudFront") || response.status === 403) {
        throw new Error("GEO_BLOCKED");
      }
      
      throw new Error(`Bybit API HTTP error ${response.status}: ${errorText.substring(0, 100)}`);
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
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
  
  const now = Date.now();
  const last7Days = closedPositions.filter(p => {
    const closedTime = parseInt(p.updatedTime);
    return (now - closedTime) <= 7 * 24 * 60 * 60 * 1000;
  });
  
  const last30Days = closedPositions.filter(p => {
    const closedTime = parseInt(p.updatedTime);
    return (now - closedTime) <= 30 * 24 * 60 * 60 * 1000;
  });
  
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
      console.log(`[Bybit Stats] ⚠️ No credentials - using local DB fallback`);
      const stats = await calculateStatsFromLocalDB(daysBack);
      
      return NextResponse.json({
        success: true,
        stats,
        dataSource: "local_db",
        daysBack,
        fetchedAt: new Date().toISOString(),
        warning: "Using local database - Bybit API credentials not configured"
      });
    }
    
    const { apiKey, apiSecret } = settings[0];
    
    console.log(`[Bybit Stats] 🚀 Starting fetch for last ${daysBack} days...`);
    
    try {
      const [closedPositions, openPositions, balance] = await Promise.all([
        getAllClosedPnL(apiKey!, apiSecret!, daysBack),
        getOpenPositions(apiKey!, apiSecret!),
        getWalletBalance(apiKey!, apiSecret!),
      ]);
      
      console.log(`[Bybit Stats] ✅ Data fetched successfully from Bybit`);
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
    } catch (bybitError: any) {
      // ✅ FALLBACK: If Bybit API fails (geo-blocking, etc), use local DB
      if (bybitError.message.includes("GEO_BLOCKED") || bybitError.message.includes("403") || bybitError.message.includes("CloudFront")) {
        console.error(`[Bybit Stats] 🚫 GEO-BLOCKED - Falling back to local database`);
        
        const stats = await calculateStatsFromLocalDB(daysBack);
        
        return NextResponse.json({
          success: true,
          stats,
          dataSource: "local_db",
          daysBack,
          fetchedAt: new Date().toISOString(),
          warning: "Bybit API is geo-blocked - using local database. See /BYBIT_GEO_BLOCKING_FIX.md for solutions."
        });
      }
      
      // For other errors, also fallback
      console.error(`[Bybit Stats] ⚠️ Bybit API error: ${bybitError.message} - Falling back to local DB`);
      
      const stats = await calculateStatsFromLocalDB(daysBack);
      
      return NextResponse.json({
        success: true,
        stats,
        dataSource: "local_db",
        daysBack,
        fetchedAt: new Date().toISOString(),
        warning: `Bybit API unavailable: ${bybitError.message}. Using local database.`
      });
    }
    
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