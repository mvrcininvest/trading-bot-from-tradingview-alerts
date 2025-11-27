import { db } from '@/db';
import { botSettings, botPositions, botLogs, positionHistory, symbolLocks, diagnosticFailures, tpslRetryAttempts } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { bybitRateLimiter } from './rate-limiter';
import { classifyBybitError } from './error-classifier';
import { cleanupOrphanedOrders, getRealizedPnlFromBybit } from './bybit-helpers';
import {
  runOkoGuard,
  runAccountOkoGuard,
  incrementCapitulationCounter,
  banSymbol,
  logOkoAction,
  clearOldConfirmations,
  checkAndCleanupGhostOrders,
  shouldAttemptRepair,
  clearRepairAttempts
} from './oko-saurona';

// ✅ DIRECT BYBIT API CONNECTION (NO PROXY)
const BYBIT_API_BASE = 'https://api.bybit.com';

// ============================================
// 🔐 BYBIT SIGNATURE HELPER
// ============================================

import crypto from 'crypto';

function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  params: string
): string {
  const message = timestamp + apiKey + recvWindow + params;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('hex');
}

// ============================================
// 📊 GET CURRENT MARKET PRICE
// ============================================

async function getCurrentPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<number> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = `category=linear&symbol=${symbol}`;
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
  
  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };
  
  const response = await fetch(`${BYBIT_API_BASE}/v5/market/tickers?${params}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.retCode !== 0 || !data.result?.list || data.result.list.length === 0) {
    throw new Error(`Failed to get price for ${symbol}`);
  }

  return parseFloat(data.result.list[0].lastPrice);
}

// ============================================
// 🏦 GET ALGO ORDERS (CHECK EXISTING SL/TP)
// ============================================

async function getAlgoOrders(
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = `category=linear`;
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
  
  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };
  
  const response = await fetch(`${BYBIT_API_BASE}/v5/order/realtime?${params}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.retCode !== 0) {
    console.error(`Failed to get algo orders: ${data.retMsg}`);
    return [];
  }

  return data.result?.list || [];
}

// ============================================
// 📊 GET RECENT CLOSED POSITIONS FROM BYBIT (LAST 24H)
// ============================================

async function getRecentClosedPositionsFromBybit(
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  try {
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    
    // Get closed positions from last 24 hours
    const endTime = Date.now();
    const startTime = endTime - (24 * 60 * 60 * 1000); // 24 hours ago
    
    const params = `category=linear&startTime=${startTime}&endTime=${endTime}&limit=50`;
    const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
    
    const headers: Record<string, string> = {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-RECV-WINDOW": recvWindow,
      "Content-Type": "application/json",
    };
    
    const response = await fetch(`${BYBIT_API_BASE}/v5/position/closed-pnl?${params}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();

    if (data.retCode !== 0) {
      console.error(`[Sync] Failed to get closed positions: ${data.retMsg}`);
      return [];
    }

    return data.result?.list || [];
  } catch (error: any) {
    console.error(`[Sync] Error fetching closed positions:`, error.message);
    return [];
  }
}

// ============================================
// 🔄 AUTO-SYNC: Add missing closed positions to history
// ============================================

async function autoSyncClosedPositions(
  apiKey: string,
  apiSecret: string
): Promise<{ synced: number; skipped: number }> {
  try {
    console.log(`\n🔄 [AUTO-SYNC] Checking for new closed positions...`);
    
    // Get recent closed positions from Bybit
    const bybitClosed = await getRecentClosedPositionsFromBybit(apiKey, apiSecret);
    
    if (bybitClosed.length === 0) {
      console.log(`   ✅ No recent closed positions on Bybit`);
      return { synced: 0, skipped: 0 };
    }
    
    console.log(`   📊 Found ${bybitClosed.length} closed positions on Bybit (last 24h)`);
    
    // Get existing history from database
    const existingHistory = await db.select().from(positionHistory);
    
    let synced = 0;
    let skipped = 0;
    
    for (const bybitPos of bybitClosed) {
      const entryPrice = parseFloat(bybitPos.avgEntryPrice);
      const exitPrice = parseFloat(bybitPos.avgExitPrice);
      const qty = parseFloat(bybitPos.qty);
      const pnl = parseFloat(bybitPos.closedPnl);
      const leverage = parseInt(bybitPos.leverage);
      const closedAt = new Date(parseInt(bybitPos.updatedTime));
      const openedAt = new Date(parseInt(bybitPos.createdTime));
      
      // Check if position already exists in history
      const exists = existingHistory.some((existing) => {
        const isSameSymbol = existing.symbol === bybitPos.symbol;
        const isSameSide = existing.side === bybitPos.side;
        const isSimilarEntry = Math.abs(existing.entryPrice - entryPrice) < entryPrice * 0.001; // 0.1% tolerance
        const isSameCloseTime = 
          existing.closedAt && 
          Math.abs(new Date(existing.closedAt).getTime() - closedAt.getTime()) < 300000; // 5 min tolerance
        
        return isSameSymbol && isSameSide && isSimilarEntry && isSameCloseTime;
      });
      
      if (exists) {
        skipped++;
        continue;
      }
      
      // Calculate ROE (pnlPercent)
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
      
      // ✅ CALCULATE FEES
      // Trading fees: 0.055% on open + 0.055% on close = 0.11% total
      const tradingFeeRate = 0.00055; // 0.055% per side
      const openFee = positionValue * tradingFeeRate;
      const closeFee = (qty * exitPrice) * tradingFeeRate;
      const tradingFees = openFee + closeFee;
      
      // Gross PnL (before fees)
      const isLong = bybitPos.side === 'Buy';
      const grossPnl = isLong 
        ? (exitPrice - entryPrice) * qty 
        : (entryPrice - exitPrice) * qty;
      
      // Funding fees = difference between gross and net
      const fundingFees = Math.max(0, grossPnl - pnl - tradingFees);
      
      // Total fees
      const totalFees = tradingFees + fundingFees;
      
      console.log(`   📊 ${bybitPos.symbol}: Gross PnL: ${grossPnl.toFixed(4)}, Trading Fees: ${tradingFees.toFixed(4)}, Funding: ${fundingFees.toFixed(4)}, Net PnL: ${pnl.toFixed(4)}`);
      
      // Insert into history
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
        grossPnl,
        tradingFees,
        fundingFees,
        totalFees,
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
      
      synced++;
      console.log(`   ✅ Synced: ${bybitPos.symbol} ${bybitPos.side} - PnL: ${pnl.toFixed(2)} USDT (Fees: ${totalFees.toFixed(4)})`);
    }
    
    if (synced > 0) {
      console.log(`\n🎉 [AUTO-SYNC] Complete: ${synced} new positions added to history`);
    } else {
      console.log(`   ✅ History is up to date`);
    }
    
    return { synced, skipped };
    
  } catch (error: any) {
    console.error(`[AUTO-SYNC] Error:`, error.message);
    return { synced: 0, skipped: 0 };
  }
}

// ============================================
// 🔨 CLOSE POSITION PARTIALLY (MARKET ORDER)
// ============================================

async function closePositionPartial(
  symbol: string,
  side: string,
  quantity: number,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  
  // ✅ FIX: Round quantity to 3 decimal places to prevent signing errors
  const roundedQuantity = Math.floor(quantity * 1000) / 1000;
  
  console.log(`🔧 Quantity adjustment for partial close:`);
  console.log(`   Original: ${quantity}`);
  console.log(`   Rounded (3 decimals): ${roundedQuantity}`);
  
  const payload = {
    category: 'linear',
    symbol: symbol,
    side: side === "BUY" ? "Sell" : "Buy",
    orderType: 'Market',
    qty: roundedQuantity.toFixed(3),
    positionIdx: 0,
    timeInForce: 'GTC'
  };

  const bodyString = JSON.stringify(payload);
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, bodyString);

  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${BYBIT_API_BASE}/v5/order/create`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  if (data.retCode !== 0) {
    throw new Error(`Failed to close position: ${data.retMsg} (code: ${data.retCode})`);
  }

  return data.result?.orderId || "unknown";
}

// ============================================
// 🛡️ VERIFY POSITION IS ACTUALLY CLOSED
// ============================================

async function verifyPositionClosed(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  maxAttempts: number = 5,
  delayMs: number = 2000
): Promise<{ isClosed: boolean; finalSize: number; error?: string }> {
  console.log(`\n🔍 [VERIFY] Checking if ${symbol} position is actually closed...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      const positions = await getBybitPositions(apiKey, apiSecret);
      const position = positions.find((p: any) => p.symbol === symbol && parseFloat(p.size) > 0);
      
      if (!position) {
        console.log(`   ✅ [VERIFY] Attempt ${attempt}/${maxAttempts}: Position CONFIRMED CLOSED on exchange`);
        return { isClosed: true, finalSize: 0 };
      }
      
      const size = parseFloat(position.size);
      console.warn(`   ⚠️ [VERIFY] Attempt ${attempt}/${maxAttempts}: Position STILL OPEN - Size: ${size}`);
      
      if (attempt === maxAttempts) {
        console.error(`   ❌ [VERIFY] All ${maxAttempts} attempts failed - position still exists!`);
        return { 
          isClosed: false, 
          finalSize: size,
          error: `Position still open after ${maxAttempts} verification attempts (size: ${size})`
        };
      }
      
    } catch (error: any) {
      console.error(`   ❌ [VERIFY] Attempt ${attempt} error: ${error.message}`);
      
      if (attempt === maxAttempts) {
        return {
          isClosed: false,
          finalSize: -1,
          error: `Verification failed: ${error.message}`
        };
      }
    }
  }
  
  return { isClosed: false, finalSize: -1, error: 'Unknown verification failure' };
}

// ============================================
// 🛡️ RE-VERIFY AND RESTORE SL/TP AFTER PARTIAL CLOSE
// ============================================

async function restoreSlTpAfterPartialClose(
  symbol: string,
  side: string,
  remainingQty: number,
  expectedSL: number,
  expectedTP: number | null,
  positionId: number,
  apiKey: string,
  apiSecret: string
): Promise<{ slRestored: boolean; tpRestored: boolean }> {
  console.log(`\n🛡️ CRITICAL: Verifying SL/TP after partial close...`);
  
  // Wait for Bybit to process the partial close
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Get current position state
    const positions = await getBybitPositions(apiKey, apiSecret);
    const position = positions.find((p: any) => p.symbol === symbol && parseFloat(p.size) > 0);
    
    if (!position) {
      console.error(`   ❌ Position not found after partial close!`);
      return { slRestored: false, tpRestored: false };
    }
    
    const actualSL = position.stopLoss && parseFloat(position.stopLoss) > 0 ? parseFloat(position.stopLoss) : null;
    const actualTP = position.takeProfit && parseFloat(position.takeProfit) > 0 ? parseFloat(position.takeProfit) : null;
    
    console.log(`   📊 Current state:`);
    console.log(`      SL: ${actualSL ? actualSL.toFixed(4) : 'MISSING'} (expected: ${expectedSL.toFixed(4)})`);
    console.log(`      TP: ${actualTP ? actualTP.toFixed(4) : 'MISSING'} (expected: ${expectedTP ? expectedTP.toFixed(4) : 'N/A'})`);
    
    let slRestored = true;
    let tpRestored = true;
    
    // Restore SL if missing or wrong
    if (!actualSL || Math.abs(actualSL - expectedSL) > 0.0001) {
      console.error(`   🚨 SL MISSING/WRONG - Restoring immediately...`);
      
      const slAlgoId = await setAlgoOrderWithRetry(
        symbol,
        side,
        remainingQty,
        expectedSL,
        "sl",
        positionId,
        apiKey,
        apiSecret,
        5 // More aggressive retry for critical SL restoration
      );
      
      if (slAlgoId) {
        console.log(`   ✅ SL RESTORED @ ${expectedSL.toFixed(4)}`);
        
        await logOkoAction(
          positionId,
          'SL_RESTORED',
          'sl_restored_after_partial_close',
          `SL restored after partial close @ ${expectedSL.toFixed(4)}`,
          1,
          { symbol, slPrice: expectedSL }
        );
      } else {
        console.error(`   ❌ FAILED TO RESTORE SL!`);
        slRestored = false;
        
        await logOkoAction(
          positionId,
          'SL_RESTORE_FAILED',
          'sl_restore_failed_critical',
          `CRITICAL: Failed to restore SL after partial close - position at risk!`,
          1,
          { symbol, expectedSL }
        );
      }
    } else {
      console.log(`   ✅ SL intact @ ${actualSL.toFixed(4)}`);
    }
    
    // Restore TP if expected and missing/wrong
    if (expectedTP) {
      if (!actualTP || Math.abs(actualTP - expectedTP) > 0.0001) {
        console.error(`   ⚠️ TP MISSING/WRONG - Restoring...`);
        
        const tpAlgoId = await setAlgoOrderWithRetry(
          symbol,
          side,
          remainingQty,
          expectedTP,
          "tp",
          positionId,
          apiKey,
          apiSecret,
          3
        );
        
        if (tpAlgoId) {
          console.log(`   ✅ TP RESTORED @ ${expectedTP.toFixed(4)}`);
        } else {
          console.error(`   ⚠️ Failed to restore TP (less critical)`);
          tpRestored = false;
        }
      } else {
        console.log(`   ✅ TP intact @ ${actualTP.toFixed(4)}`);
      }
    }
    
    return { slRestored, tpRestored };
    
  } catch (error: any) {
    console.error(`   ❌ Error during SL/TP restoration:`, error.message);
    return { slRestored: false, tpRestored: false };
  }
}

// ============================================
// 🔄 CANCEL ALGO ORDER
// ============================================

async function cancelAlgoOrder(
  algoId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<boolean> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  
  const payload = {
    category: 'linear',
    symbol: symbol,
    orderId: algoId
  };

  const bodyString = JSON.stringify(payload);
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, bodyString);

  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${BYBIT_API_BASE}/v5/order/cancel`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  return data.retCode === 0;
}

// ============================================
// 🔄 CANCEL ALGO ORDER WITH RETRY
// ============================================

async function cancelAlgoOrderWithRetry(
  algoId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await cancelAlgoOrder(algoId, symbol, apiKey, apiSecret);
      if (result) {
        console.log(`✅ Cancelled algo ${algoId} (attempt ${attempt})`);
        return true;
      }
    } catch (error: any) {
      console.error(`❌ Cancel attempt ${attempt} failed:`, error.message);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  return false;
}

// ============================================
// 🎯 SET NEW ALGO ORDER (SL/TP)
// ============================================

async function setAlgoOrder(
  symbol: string,
  side: string,
  quantity: number,
  triggerPrice: number,
  orderType: "sl" | "tp",
  apiKey: string,
  apiSecret: string
): Promise<string | null> {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  
  // ✅ CRITICAL FIX: Use /v5/position/trading-stop endpoint instead of /v5/order/create
  // This endpoint is specifically designed for setting SL/TP on positions
  const payload: any = {
    category: 'linear',
    symbol: symbol,
    positionIdx: 0
  };

  if (orderType === "sl") {
    payload.stopLoss = triggerPrice.toString();
  } else {
    payload.takeProfit = triggerPrice.toString();
  }

  const bodyString = JSON.stringify(payload);
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, bodyString);

  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };

  console.error(`🔧 [SET_ALGO] Setting ${orderType.toUpperCase()} for ${symbol}`);
  console.error(`   Payload: ${JSON.stringify(payload, null, 2)}`);

  const response = await fetch(`${BYBIT_API_BASE}/v5/position/trading-stop`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  console.error(`📥 [SET_ALGO] Bybit Response:`);
  console.error(`   Code: ${data.retCode}`);
  console.error(`   Message: ${data.retMsg}`);

  if (data.retCode !== 0) {
    console.error(`❌ [SET_ALGO] Failed to set ${orderType.toUpperCase()}: ${data.retMsg} (code: ${data.retCode})`);
    return null;
  }

  // ✅ SUCCESS: /v5/position/trading-stop doesn't return orderId, but operation succeeded
  // Return success indicator
  console.error(`✅ [SET_ALGO] Successfully set ${orderType.toUpperCase()} @ ${triggerPrice.toFixed(4)}`);
  
  // Return success token instead of null
  return "SUCCESS";
}

// ============================================
// 🎯 SET ALGO ORDER WITH RETRY AND ERROR TRACKING
// ============================================

async function setAlgoOrderWithRetry(
  symbol: string,
  side: string,
  quantity: number,
  triggerPrice: number,
  orderType: "sl" | "tp",
  positionId: number,
  apiKey: string,
  apiSecret: string,
  maxRetries = 3
): Promise<string | null> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔧 [RETRY ${attempt}/${maxRetries}] Setting ${orderType.toUpperCase()} @ ${triggerPrice.toFixed(4)}...`);

      // ✅ REMOVED: No need to cancel old orders anymore
      // When using /v5/position/trading-stop, we're updating SL/TP directly on the position
      // Previous values are automatically overwritten

      const algoId = await setAlgoOrder(
        symbol,
        side,
        quantity,
        triggerPrice,
        orderType,
        apiKey,
        apiSecret
      );

      if (algoId) {
        // Success - log to tpslRetryAttempts
        await db.insert(tpslRetryAttempts).values({
          positionId,
          attemptNumber: attempt,
          orderType: orderType === 'sl' ? 'sl' : 'tp1',
          triggerPrice,
          success: true,
          errorCode: null,
          errorMessage: null,
          errorType: null,
          createdAt: new Date().toISOString(),
        });

        console.log(`✅ ${orderType.toUpperCase()} set successfully on attempt ${attempt}`);
        return algoId;
      } else {
        throw new Error('API returned null orderId');
      }
    } catch (error: any) {
      lastError = error;
      
      // Classify error
      const classified = classifyBybitError(
        error.code || 'unknown',
        error.message || String(error)
      );

      // Log attempt
      await db.insert(tpslRetryAttempts).values({
        positionId,
        attemptNumber: attempt,
        orderType: orderType === 'sl' ? 'sl' : 'tp1',
        triggerPrice,
        success: false,
        errorCode: error.code || 'unknown',
        errorMessage: error.message || String(error),
        errorType: classified.type,
        createdAt: new Date().toISOString(),
      });

      console.error(`❌ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      console.error(`   Error type: ${classified.type}, Permanent: ${classified.isPermanent}`);

      // If permanent error (trade_fault), don't retry
      if (classified.isPermanent) {
        console.error(`🚫 Permanent error detected - stopping retries`);
        return null;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = (classified.retryAfterMs || 2000) * attempt;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error(`❌ All ${maxRetries} attempts failed for ${orderType.toUpperCase()}`);
  return null;
}

// ============================================
// 📊 SAVE POSITION TO HISTORY WITH REALIZED PNL
// ============================================

async function savePositionToHistory(
  dbPos: any,
  currentPrice: number,
  closeReason: string,
  closeOrderId: string | null,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  try {
    console.log(`💾 Saving position ${dbPos.id} to history...`);
    console.log(`   Close reason: ${closeReason}`);

    const openedAt = new Date(dbPos.openedAt);
    const closedAt = new Date();
    const durationMinutes = Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);

    // Try to get realized PnL from Bybit
    let realizedPnl: number | null = null;
    let finalClosePrice = currentPrice;

    if (closeOrderId) {
      const pnlData = await getRealizedPnlFromBybit(
        closeOrderId,
        dbPos.symbol,
        apiKey,
        apiSecret
      );

      if (pnlData) {
        realizedPnl = pnlData.realizedPnl;
        finalClosePrice = pnlData.fillPrice;
        console.log(`✅ Got realized PnL from Bybit: ${realizedPnl.toFixed(2)} USD`);
      }
    }

    // Fallback: Calculate estimated PnL
    if (realizedPnl === null) {
      const isLong = dbPos.side === 'BUY';
      const priceDiff = isLong 
        ? (finalClosePrice - dbPos.entryPrice) 
        : (dbPos.entryPrice - finalClosePrice);
      
      realizedPnl = priceDiff * dbPos.quantity;
      console.log(`⚠️ Using estimated PnL: ${realizedPnl.toFixed(2)} USD (no Bybit data)`);
    }

    const pnlPercent = (realizedPnl / dbPos.initialMargin) * 100;

    // ✅ CRITICAL: ALWAYS insert to positionHistory
    await db.insert(positionHistory).values({
      positionId: dbPos.id,
      alertId: dbPos.alertId,
      symbol: dbPos.symbol,
      side: dbPos.side,
      tier: dbPos.tier,
      entryPrice: dbPos.entryPrice,
      closePrice: finalClosePrice,
      quantity: dbPos.quantity,
      leverage: dbPos.leverage,
      pnl: realizedPnl,
      pnlPercent,
      closeReason,
      tp1Hit: dbPos.tp1Hit || false,
      tp2Hit: dbPos.tp2Hit || false,
      tp3Hit: dbPos.tp3Hit || false,
      confirmationCount: dbPos.confirmationCount || 1,
      openedAt: dbPos.openedAt,
      closedAt: closedAt.toISOString(),
      durationMinutes,
      alertData: dbPos.alertData,
    });

    console.log(`✅ Position saved to history: PnL ${realizedPnl.toFixed(2)} USD (${pnlPercent.toFixed(2)}%), Duration: ${durationMinutes}min, Reason: ${closeReason}`);
  } catch (error: any) {
    console.error(`❌ Failed to save position to history:`, error.message);
    // Don't throw - position is already closed, just log error
  }
}

// ============================================
// 📊 GET OPEN POSITIONS FROM BYBIT
// ============================================

async function getBybitPositions(
  apiKey: string,
  apiSecret: string
) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = `category=linear&settleCoin=USDT`;
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, params);
  
  const headers: Record<string, string> = {
    "X-BAPI-API-KEY": apiKey,
    "X-BAPI-SIGN": signature,
    "X-BAPI-TIMESTAMP": timestamp,
    "X-BAPI-SIGN-TYPE": "2",
    "X-BAPI-RECV-WINDOW": recvWindow,
    "Content-Type": "application/json",
  };
  
  const response = await fetch(`${BYBIT_API_BASE}/v5/position/list?${params}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.retCode !== 0) {
    return [];
  }

  return data.result?.list?.filter((p: any) => parseFloat(p.size) !== 0) || [];
}

// ============================================
// 📥 IMPORT MANUAL POSITIONS FROM BYBIT
// ============================================

async function importManualPositions(
  apiKey: string,
  apiSecret: string,
  config: any
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  try {
    console.log(`\n📥 [IMPORT] Checking for manual positions on Bybit...`);
    
    // Get all open positions from Bybit
    const bybitPositions = await getBybitPositions(apiKey, apiSecret);
    
    if (bybitPositions.length === 0) {
      console.log(`   ✅ No open positions on Bybit`);
      return { imported: 0, skipped: 0, errors: [] };
    }
    
    console.log(`   📊 Found ${bybitPositions.length} open positions on Bybit`);
    
    // Get existing positions from DB
    const dbPositions = await db.select()
      .from(botPositions)
      .where(eq(botPositions.status, "open"));
    
    const dbSymbols = new Set(dbPositions.map(p => p.symbol));
    
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    for (const bybitPos of bybitPositions) {
      const symbol = bybitPos.symbol;
      const size = Math.abs(parseFloat(bybitPos.size));
      
      if (size === 0) {
        continue;
      }
      
      // Skip if already in DB
      if (dbSymbols.has(symbol)) {
        skipped++;
        continue;
      }
      
      console.log(`   🆕 Found manual position: ${symbol} ${bybitPos.side} (${size})`);
      
      try {
        const entryPrice = parseFloat(bybitPos.avgPrice);
        const leverage = parseInt(bybitPos.leverage);
        const side = bybitPos.side === 'Buy' ? 'BUY' : 'SELL';
        const isLong = side === 'BUY';
        
        // Calculate position value and margin
        const positionValue = size * entryPrice;
        const initialMargin = positionValue / leverage;
        
        // Get current price
        const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret);
        
        // Calculate default SL/TP (conservative: 2% SL, 3% TP)
        const slRR = config.defaultSlRR || 2.0;
        const tp1RR = config.tp1RR || 3.0;
        
        const stopLoss = isLong 
          ? entryPrice * (1 - slRR / 100)
          : entryPrice * (1 + slRR / 100);
        
        const tp1Price = isLong
          ? entryPrice * (1 + tp1RR / 100)
          : entryPrice * (1 - tp1RR / 100);
        
        // Check if position already has SL/TP from Bybit
        const hasSL = bybitPos.stopLoss && parseFloat(bybitPos.stopLoss) > 0;
        const hasTP = bybitPos.takeProfit && parseFloat(bybitPos.takeProfit) > 0;
        
        const existingSL = hasSL ? parseFloat(bybitPos.stopLoss) : null;
        const existingTP = hasTP ? parseFloat(bybitPos.takeProfit) : null;
        
        console.log(`   📊 Entry: ${entryPrice}, Current: ${currentPrice}, Leverage: ${leverage}x`);
        console.log(`   🎯 Existing SL/TP: SL=${existingSL ? existingSL.toFixed(4) : 'NONE'}, TP=${existingTP ? existingTP.toFixed(4) : 'NONE'}`);
        
        // Insert into DB
        const [insertedPos] = await db.insert(botPositions).values({
          alertId: null, // Manual position - no alert
          symbol,
          side,
          tier: 'Standard',
          entryPrice,
          quantity: size,
          leverage,
          stopLoss: existingSL || stopLoss,
          currentSl: existingSL || stopLoss,
          tp1Price: existingTP || tp1Price,
          tp2Price: null,
          tp3Price: null,
          tp1Hit: false,
          tp2Hit: false,
          tp3Hit: false,
          status: 'open',
          openedAt: new Date().toISOString(),
          initialMargin,
          unrealisedPnl: parseFloat(bybitPos.unrealisedPnl || '0'),
          lastUpdated: new Date().toISOString(),
          confirmationCount: 1,
          alertData: { imported: true, importedAt: new Date().toISOString() },
        }).returning();
        
        console.log(`   ✅ Imported to DB (ID: ${insertedPos.id})`);
        
        // If position doesn't have SL/TP on Bybit, set them now
        if (!hasSL || !hasTP) {
          console.log(`   🔧 Setting missing SL/TP...`);
          
          if (!hasSL) {
            const slAlgoId = await setAlgoOrderWithRetry(
              symbol,
              side,
              size,
              stopLoss,
              "sl",
              insertedPos.id,
              apiKey,
              apiSecret,
              3
            );
            
            if (slAlgoId) {
              console.log(`   ✅ SL set @ ${stopLoss.toFixed(4)}`);
            } else {
              console.error(`   ⚠️ Failed to set SL - will retry on monitor cycle`);
            }
          }
          
          if (!hasTP) {
            const tpAlgoId = await setAlgoOrderWithRetry(
              symbol,
              side,
              size,
              tp1Price,
              "tp",
              insertedPos.id,
              apiKey,
              apiSecret,
              3
            );
            
            if (tpAlgoId) {
              console.log(`   ✅ TP set @ ${tp1Price.toFixed(4)}`);
            } else {
              console.error(`   ⚠️ Failed to set TP - will retry on monitor cycle`);
            }
          }
        } else {
          console.log(`   ✅ Position already has SL/TP - no action needed`);
        }
        
        await logOkoAction(
          insertedPos.id,
          'MANUAL_IMPORT',
          'manual_position_imported',
          `Manual position imported from Bybit: ${symbol} ${side} @ ${entryPrice.toFixed(4)}`,
          1,
          { 
            symbol, 
            side, 
            entryPrice, 
            quantity: size, 
            hasSL, 
            hasTP,
            existingSL,
            existingTP
          }
        );
        
        imported++;
        
      } catch (error: any) {
        const errMsg = `Failed to import ${symbol}: ${error.message}`;
        console.error(`   ❌ ${errMsg}`);
        errors.push(errMsg);
      }
    }
    
    if (imported > 0) {
      console.log(`\n🎉 [IMPORT] Complete: ${imported} manual positions imported, ${skipped} already in DB`);
    } else {
      console.log(`   ✅ All positions already tracked in DB`);
    }
    
    return { imported, skipped, errors };
    
  } catch (error: any) {
    console.error(`[IMPORT] Error:`, error.message);
    return { imported: 0, skipped: 0, errors: [error.message] };
  }
}

// ============================================
// 🤖 MAIN MONITOR FUNCTION (WITH OKO INTEGRATION)
// ============================================

export async function monitorAndManagePositions(silent = true) {
  try {
    console.log("\n🔍 [MONITOR] Starting position monitoring...");

    // Get settings
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey) {
      console.log("⚠️ [MONITOR] No credentials found");
      return { success: false, reason: "no_credentials" };
    }

    const config = settings[0];
    const apiKey = config.apiKey!;
    const apiSecret = config.apiSecret!;

    // 🆕 FAZA 2: Prepare credentials for Oko
    const credentials = {
      apiKey,
      apiSecret
    };

    // ============================================
    // 🔄 AUTO-SYNC: Check for new closed positions on Bybit
    // ============================================
    console.log(`\n🔄 [AUTO-SYNC] Checking for new closed positions on Bybit...`);
    const syncResult = await autoSyncClosedPositions(apiKey, apiSecret);
    console.log(`   📊 Sync result: ${syncResult.synced} new, ${syncResult.skipped} already in database`);

    // ============================================
    // 📥 IMPORT MANUAL POSITIONS: Check for positions on Bybit not in DB
    // ============================================
    console.log(`\n📥 [IMPORT] Checking for manual positions...`);
    const importResult = await importManualPositions(apiKey, apiSecret, config);
    console.log(`   📊 Import result: ${importResult.imported} imported, ${importResult.skipped} already tracked`);
    
    if (importResult.errors.length > 0) {
      console.error(`   ⚠️ Import errors: ${importResult.errors.join(', ')}`);
    }

    // Get bot positions from DB
    const dbPositions = await db.select()
      .from(botPositions)
      .where(eq(botPositions.status, "open"));

    console.log(`📊 [MONITOR] Found ${dbPositions.length} open positions in database`);

    // Get Bybit positions
    const bybitPositions = await getBybitPositions(apiKey, apiSecret);
    
    // Get existing algo orders
    const algoOrders = await getAlgoOrders(apiKey, apiSecret);
    
    console.log(`📊 [MONITOR] Bybit Positions: ${bybitPositions.length}, Algo Orders: ${algoOrders.length}`);

    // ============================================
    // 🆕 FAZA 4: GHOST ORDERS CLEANUP (FIRST!)
    // ============================================
    
    console.log(`\n👻 [MONITOR] Checking for ghost orders...`);
    const ghostCleanupResult = await checkAndCleanupGhostOrders(
      credentials,
      dbPositions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        entryPrice: p.entryPrice,
        currentPrice: 0,
        quantity: p.quantity,
        stopLoss: p.stopLoss,
        currentSl: p.currentSl,
        unrealisedPnl: p.unrealisedPnl,
        initialMargin: p.initialMargin,
        openedAt: p.openedAt,
        tp1Hit: p.tp1Hit || false,
      }))
    );

    if (ghostCleanupResult.cleaned > 0 || ghostCleanupResult.failed > 0) {
      console.log(`📊 [MONITOR] Ghost Orders: ${ghostCleanupResult.cleaned} cancelled, ${ghostCleanupResult.failed} failed`);
      
      ghostCleanupResult.details.forEach(detail => {
        if (detail.status === 'cancelled') {
          console.log(`   ✅ ${detail.symbol}: ${detail.orderType} (${detail.orderId})`);
        } else {
          console.log(`   ❌ ${detail.symbol}: ${detail.orderType} (${detail.orderId}) - FAILED`);
        }
      });

      // Log to Oko actions
      await logOkoAction(
        null,
        'GHOST_ORDERS',
        'ghost_orders_cleanup',
        `Cleaned ${ghostCleanupResult.cleaned}/${ghostCleanupResult.cleaned + ghostCleanupResult.failed} orphaned orders`,
        1,
        { 
          cleaned: ghostCleanupResult.cleaned, 
          failed: ghostCleanupResult.failed,
          details: ghostCleanupResult.details 
        }
      );
    } else {
      console.log(`✅ [MONITOR] No ghost orders found`);
    }

    if (dbPositions.length === 0) {
      return { 
        success: true, 
        checked: 0, 
        tpHits: 0, 
        slAdjustments: 0, 
        slTpFixed: 0, 
        emergencyClosed: 0, 
        okoActions: 0,
        ghostOrdersCleaned: ghostCleanupResult.cleaned,
        manualImported: importResult.imported
      };
    }

    // Check for symbol locks
    const activeLocks = await db.select()
      .from(symbolLocks)
      .where(isNull(symbolLocks.unlockedAt));

    if (activeLocks.length > 0) {
      console.log(`🚫 [MONITOR] ${activeLocks.length} symbol(s) locked:`);
      activeLocks.forEach(lock => {
        console.log(`   - ${lock.symbol}: ${lock.lockReason} (${lock.failureCount} failures)`);
      });
    }

    // ============================================
    // 👁️ OKO SAURONA: ACCOUNT-LEVEL CHECK FIRST
    // ============================================
    
    // Prepare position data for Oko
    const allPositionData = await Promise.all(dbPositions.map(async (dbPos) => {
      const symbol = dbPos.symbol;
      const bybitPos = bybitPositions.find((p: any) => p.symbol === symbol);
      
      if (!bybitPos) return null;
      
      const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret);
      
      return {
        id: dbPos.id,
        symbol: dbPos.symbol,
        side: dbPos.side,
        entryPrice: dbPos.entryPrice,
        currentPrice,
        quantity: Math.abs(parseFloat(bybitPos.size)),
        stopLoss: dbPos.stopLoss,
        currentSl: dbPos.currentSl,
        unrealisedPnl: parseFloat(bybitPos.unrealisedPnl || "0"),
        initialMargin: dbPos.initialMargin,
        openedAt: dbPos.openedAt,
        tp1Hit: dbPos.tp1Hit || false,
      };
    }));

    const validPositionData = allPositionData.filter(p => p !== null) as any[];

    // Run account-level Oko guard
    const accountOkoResult = await runAccountOkoGuard(validPositionData);
    
    if (accountOkoResult.shouldCloseAll) {
      console.log(`🚨 [OKO] ACCOUNT DRAWDOWN - CLOSING ALL POSITIONS!`);
      console.log(`   Reason: ${accountOkoResult.reason}`);
      
      // Close all positions immediately
      let closedCount = 0;
      for (const dbPos of dbPositions) {
        const symbol = dbPos.symbol;
        
        try {
          const closeOrderId = await closePositionPartial(
            symbol,
            dbPos.side,
            dbPos.quantity,
            apiKey,
            apiSecret
          );
          
          await db.update(botPositions)
            .set({
              status: "closed",
              closeReason: "oko_account_drawdown",
              closedAt: new Date().toISOString(),
            })
            .where(eq(botPositions.id, dbPos.id));

          const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret);
          await savePositionToHistory(dbPos, currentPrice, 'oko_account_drawdown', closeOrderId, apiKey, apiSecret);
          await cleanupOrphanedOrders(symbol, apiKey, apiSecret, 3);
          
          closedCount++;
          console.log(`   ✅ Closed ${symbol}`);
        } catch (error: any) {
          console.error(`   ❌ Failed to close ${symbol}:`, error.message);
        }
      }
      
      return {
        success: true,
        checked: dbPositions.length,
        tpHits: 0,
        slAdjustments: 0,
        slTpFixed: 0,
        emergencyClosed: closedCount,
        okoActions: closedCount,
        accountDrawdownTriggered: true,
        ghostOrdersCleaned: ghostCleanupResult.cleaned,
        manualImported: importResult.imported
      };
    }

    let tpHits = 0;
    let slAdjustments = 0;
    let slTpFixed = 0;
    let emergencyClosed = 0;
    let okoActions = 0;
    const errors: string[] = [];
    const details: any[] = [];

    for (const dbPos of dbPositions) {
      const symbol = dbPos.symbol;
      
      console.log(`\n🔍 [MONITOR] Checking ${symbol} (${dbPos.side})...`);

      // Find matching Bybit position
      const bybitPos = bybitPositions.find((p: any) => p.symbol === symbol);
      
      if (!bybitPos) {
        console.log(`⚠️ [MONITOR] ${symbol} not found on exchange - marking as closed`);
        
        await db.update(botPositions)
          .set({
            status: "closed",
            closeReason: "closed_on_exchange",
            closedAt: new Date().toISOString(),
          })
          .where(eq(botPositions.id, dbPos.id));
        
        details.push({
          symbol,
          side: dbPos.side,
          action: "closed",
          reason: "Position not found on exchange"
        });
        
        continue;
      }

      // Get current price
      const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret);
      const quantity = Math.abs(parseFloat(bybitPos.size));
      const side = dbPos.side;
      const entryPrice = dbPos.entryPrice;
      
      // ✅ Update DB with live PnL from Bybit
      const livePnl = parseFloat(bybitPos.unrealisedPnl || "0");
      if (Math.abs(livePnl - dbPos.unrealisedPnl) > 0.01) {
        await db.update(botPositions)
          .set({
            unrealisedPnl: livePnl,
            lastUpdated: new Date().toISOString()
          })
          .where(eq(botPositions.id, dbPos.id));
        
        console.log(`   💰 PnL updated: ${dbPos.unrealisedPnl.toFixed(2)} → ${livePnl.toFixed(2)} USDT`);
      }
      
      console.log(`   Entry: ${entryPrice}, Current: ${currentPrice}, Qty: ${quantity}, PnL: ${livePnl.toFixed(2)} USDT`);

      // ============================================
      // 👁️ OKO SAURONA: POSITION-LEVEL CHECKS
      // ============================================
      
      const positionData = {
        id: dbPos.id,
        symbol: dbPos.symbol,
        side: dbPos.side,
        entryPrice: dbPos.entryPrice,
        currentPrice,
        quantity,
        stopLoss: dbPos.stopLoss,
        currentSl: dbPos.currentSl,
        unrealisedPnl: livePnl,
        initialMargin: dbPos.initialMargin,
        openedAt: dbPos.openedAt,
        tp1Hit: dbPos.tp1Hit || false,
      };

      // 🆕 FAZA 2 + 3: Pass credentials AND bybitPositions to Oko
      const okoResult = await runOkoGuard(positionData, validPositionData, credentials, bybitPositions);
      
      // ============================================
      // 🆕 FAZA 3: HANDLE GHOST POSITION CLEANUP
      // ============================================
      
      if (okoResult.shouldFix && okoResult.action === 'ghost_position_cleanup') {
        console.log(`👻 [OKO] Ghost position detected - marking as closed in DB`);
        
        try {
          await db.update(botPositions)
            .set({
              status: "closed",
              closeReason: "ghost_position_cleanup",
              closedAt: new Date().toISOString(),
            })
            .where(eq(botPositions.id, dbPos.id));
          
          slTpFixed++;
          okoActions++;
          
          details.push({
            symbol,
            side,
            action: "ghost_position_cleanup",
            reason: okoResult.reason
          });
          
          console.log(`   ✅ Ghost position cleaned up from database`);
          continue;
          
        } catch (error: any) {
          const errMsg = `Failed to cleanup ghost position ${symbol}: ${error.message}`;
          console.error(`   ❌ ${errMsg}`);
          errors.push(errMsg);
        }
      }
      
      // ============================================
      // 🆕 FAZA 2: HANDLE REPAIR ACTIONS (shouldFix)
      // ============================================
      
      if (okoResult.shouldFix) {
        console.log(`🔧 [OKO] Repair action required: ${okoResult.action}`);
        console.log(`   Reason: ${okoResult.reason}`);
        
        if (okoResult.action === 'missing_sl_tp') {
          console.log(`   ℹ️ [OKO] Missing SL/TP will be handled by existing repair logic with attempt limiter`);
        } else if (okoResult.action === 'tp1_quantity_fix') {
          const realQuantity = okoResult.metadata.realQuantity;
          
          try {
            await db.update(botPositions)
              .set({
                quantity: realQuantity,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            console.log(`   ✅ [OKO] Updated quantity in DB: ${dbPos.quantity} → ${realQuantity}`);
            slTpFixed++;
            okoActions++;
            
            details.push({
              symbol,
              side,
              action: "tp1_quantity_fixed",
              reason: `Updated quantity from ${dbPos.quantity} to ${realQuantity}`
            });
          } catch (error: any) {
            const errMsg = `Failed to fix TP1 quantity for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }
      
      // ============================================
      // 🆕 FAZA 2: HANDLE CLOSE ACTIONS (shouldClose)
      // ============================================
      
      if (okoResult.shouldClose) {
        console.log(`🚨 [OKO] Close action required: ${okoResult.action}`);
        console.log(`   Reason: ${okoResult.reason}`);
        
        try {
          const closeOrderId = await closePositionPartial(
            symbol,
            side,
            quantity,
            apiKey,
            apiSecret
          );
          
          await db.update(botPositions)
            .set({
              status: "closed",
              closeReason: `oko_${okoResult.action}`,
              closedAt: new Date().toISOString(),
            })
            .where(eq(botPositions.id, dbPos.id));

          // ✅ CRITICAL: Save to history with specific Oko close reason
          await savePositionToHistory(
            dbPos,
            currentPrice,
            `oko_${okoResult.action}`,
            closeOrderId,
            apiKey,
            apiSecret
          );

          await cleanupOrphanedOrders(symbol, apiKey, apiSecret, 3);
          
          emergencyClosed++;
          okoActions++;
          
          details.push({
            symbol,
            side,
            action: `oko_${okoResult.action}`,
            reason: okoResult.reason
          });

          // ============================================
          // 🚫 CAPITULATION LOGIC
          // ============================================
          
          const newCounter = await incrementCapitulationCounter();
          const okoSettings = config;
          const capitulationThreshold = okoSettings.okoCapitulationThreshold || 3;
          
          if (newCounter >= capitulationThreshold) {
            console.log(`🚨 [OKO] CAPITULATION THRESHOLD REACHED (${newCounter}/${capitulationThreshold})`);
            
            const banDuration = okoSettings.okoBanDurationHours || 24;
            await banSymbol(
              dbPos.symbol,
              `Capitulation after ${newCounter} Oko emergency closures`,
              banDuration
            );
            
            await db.update(botSettings)
              .set({
                okoCapitulationCounter: 0,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(botSettings.id, okoSettings.id));
            
            console.log(`   🚫 Symbol ${dbPos.symbol} BANNED for ${banDuration}h`);
            console.log(`   🔄 Capitulation counter reset to 0`);
          }
          
          console.log(`   ✅ Position closed by Oko Saurona`);
          continue;
          
        } catch (error: any) {
          const errMsg = `Failed to execute Oko action for ${symbol}: ${error.message}`;
          console.error(`   ❌ ${errMsg}`);
          errors.push(errMsg);
        }
      }

      // ============================================
      // 🎯 CHECK TP LEVELS AND PARTIAL CLOSE
      // ============================================

      const isLong = side === "BUY";
      
      // TP1 Check
      if (dbPos.tp1Price && !dbPos.tp1Hit) {
        const tp1Hit = isLong 
          ? currentPrice >= dbPos.tp1Price 
          : currentPrice <= dbPos.tp1Price;
        
        if (tp1Hit) {
          console.log(`   🎯 TP1 HIT @ ${dbPos.tp1Price}! Closing partial position...`);
          
          const closePercent = config.tp1Percent || 50.0;
          const closeQty = (quantity * closePercent) / 100;
          
          try {
            const orderId = await closePositionPartial(
              symbol, 
              side, 
              closeQty, 
              apiKey, 
              apiSecret
            );
            
            console.log(`   ✅ Closed ${closePercent}% (${closeQty}) @ market - Order: ${orderId}`);
            
            const remainingQty = quantity - closeQty;
            
            await db.update(botPositions)
              .set({
                tp1Hit: true,
                quantity: remainingQty,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp1_hit",
              reason: `Closed ${closePercent}% @ ${currentPrice}`
            });
            
            // 🛡️ CRITICAL: Determine expected SL after TP1
            let expectedSL = dbPos.currentSl || dbPos.stopLoss;
            let expectedTP: number | null = dbPos.tp2Price;
            
            // Adjust SL based on strategy
            if (config.slManagementAfterTp1 === "breakeven") {
              console.log(`   📈 Moving SL to breakeven @ ${entryPrice}`);
              expectedSL = entryPrice;
              
              const slAlgos = algoOrders.filter((a: any) => 
                a.symbol === symbol && a.stopLoss
              );
              
              for (const algo of slAlgos) {
                await cancelAlgoOrder(algo.orderId, symbol, apiKey, apiSecret);
              }
              
              await setAlgoOrder(
                symbol,
                side,
                remainingQty,
                entryPrice,
                "sl",
                apiKey,
                apiSecret
              );
              
              await db.update(botPositions)
                .set({ currentSl: entryPrice })
                .where(eq(botPositions.id, dbPos.id));
              
              slAdjustments++;
            } else if (config.slManagementAfterTp1 === "trailing") {
              const trailingDist = config.slTrailingDistance || 0.5;
              const newSl = isLong 
                ? currentPrice * (1 - trailingDist / 100)
                : currentPrice * (1 + trailingDist / 100);
              
              console.log(`   📈 Trailing SL to ${newSl.toFixed(4)}`);
              expectedSL = newSl;
              
              const slAlgos = algoOrders.filter((a: any) => 
                a.symbol === symbol && a.stopLoss
              );
              
              for (const algo of slAlgos) {
                await cancelAlgoOrder(algo.orderId, symbol, apiKey, apiSecret);
              }
              
              await setAlgoOrder(
                symbol,
                side,
                remainingQty,
                newSl,
                "sl",
                apiKey,
                apiSecret
              );
              
              await db.update(botPositions)
                .set({ currentSl: newSl })
                .where(eq(botPositions.id, dbPos.id));
              
              slAdjustments++;
            }
            
            // 🛡️🛡️🛡️ CRITICAL FIX: RE-VERIFY AND RESTORE SL/TP AFTER PARTIAL CLOSE
            console.log(`\n🛡️ CRITICAL SAFETY: Re-verifying SL/TP after TP1 partial close...`);
            const restoreResult = await restoreSlTpAfterPartialClose(
              symbol,
              side,
              remainingQty,
              expectedSL,
              expectedTP,
              dbPos.id,
              apiKey,
              apiSecret
            );
            
            if (!restoreResult.slRestored) {
              console.error(`   🚨🚨🚨 CRITICAL FAILURE: Could not restore SL after TP1!`);
              // Emergency close the remaining position
              try {
                console.error(`   🚨 EMERGENCY: Closing remaining position - cannot guarantee SL protection!`);
                const emergencyCloseId = await closePositionPartial(symbol, side, remainingQty, apiKey, apiSecret);
                
                await db.update(botPositions)
                  .set({
                    status: "closed",
                    closeReason: "emergency_no_sl_after_tp1",
                    closedAt: new Date().toISOString(),
                  })
                  .where(eq(botPositions.id, dbPos.id));

                await savePositionToHistory(dbPos, currentPrice, 'emergency_no_sl_after_tp1', emergencyCloseId, apiKey, apiSecret);
                
                emergencyClosed++;
                okoActions++;
                
                await logOkoAction(
                  dbPos.id,
                  'EMERGENCY_CLOSE',
                  'no_sl_after_tp1_emergency',
                  `Emergency close after TP1 - could not restore SL protection`,
                  1,
                  { symbol, pnl: livePnl }
                );
              } catch (emergencyError: any) {
                console.error(`   ❌❌❌ EMERGENCY CLOSE FAILED: ${emergencyError.message}`);
                // Ban symbol immediately
                await banSymbol(symbol, `Critical: Cannot restore SL after TP1`, 48);
              }
            } else {
              console.log(`   ✅✅✅ SL/TP protection restored successfully after TP1`);
            }
            
          } catch (error: any) {
            const errMsg = `Failed to close TP1 for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }

      // TP2 Check
      if (dbPos.tp2Price && dbPos.tp1Hit && !dbPos.tp2Hit) {
        const tp2Hit = isLong 
          ? currentPrice >= dbPos.tp2Price 
          : currentPrice <= dbPos.tp2Price;
        
        if (tp2Hit) {
          console.log(`   🎯 TP2 HIT @ ${dbPos.tp2Price}!`);
          
          const closePercent = config.tp2Percent || 30.0;
          const currentQty = dbPos.quantity;
          const closeQty = (currentQty * closePercent) / 100;
          
          try {
            const orderId = await closePositionPartial(
              symbol, 
              side, 
              closeQty, 
              apiKey, 
              apiSecret
            );
            
            console.log(`   ✅ Closed ${closePercent}% (${closeQty}) @ market - Order: ${orderId}`);
            
            const remainingQty = currentQty - closeQty;
            
            await db.update(botPositions)
              .set({
                tp2Hit: true,
                quantity: remainingQty,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp2_hit",
              reason: `Closed ${closePercent}% @ ${currentPrice}`
            });
            
            // 🛡️🛡️🛡️ CRITICAL FIX: RE-VERIFY AND RESTORE SL/TP AFTER PARTIAL CLOSE
            const expectedSL = dbPos.currentSl || dbPos.stopLoss;
            const expectedTP: number | null = dbPos.tp3Price;
            
            console.log(`\n🛡️ CRITICAL SAFETY: Re-verifying SL/TP after TP2 partial close...`);
            const restoreResult = await restoreSlTpAfterPartialClose(
              symbol,
              side,
              remainingQty,
              expectedSL,
              expectedTP,
              dbPos.id,
              apiKey,
              apiSecret
            );
            
            if (!restoreResult.slRestored) {
              console.error(`   🚨🚨🚨 CRITICAL FAILURE: Could not restore SL after TP2!`);
              // Emergency close the remaining position
              try {
                console.error(`   🚨 EMERGENCY: Closing remaining position - cannot guarantee SL protection!`);
                const emergencyCloseId = await closePositionPartial(symbol, side, remainingQty, apiKey, apiSecret);
                
                await db.update(botPositions)
                  .set({
                    status: "closed",
                    closeReason: "emergency_no_sl_after_tp2",
                    closedAt: new Date().toISOString(),
                  })
                  .where(eq(botPositions.id, dbPos.id));

                await savePositionToHistory(dbPos, currentPrice, 'emergency_no_sl_after_tp2', emergencyCloseId, apiKey, apiSecret);
                
                emergencyClosed++;
                okoActions++;
                
                await logOkoAction(
                  dbPos.id,
                  'EMERGENCY_CLOSE',
                  'no_sl_after_tp2_emergency',
                  `Emergency close after TP2 - could not restore SL protection`,
                  1,
                  { symbol, pnl: livePnl }
                );
              } catch (emergencyError: any) {
                console.error(`   ❌❌❌ EMERGENCY CLOSE FAILED: ${emergencyError.message}`);
                // Ban symbol immediately
                await banSymbol(symbol, `Critical: Cannot restore SL after TP2`, 48);
              }
            } else {
              console.log(`   ✅✅✅ SL/TP protection restored successfully after TP2`);
            }
            
          } catch (error: any) {
            const errMsg = `Failed to close TP2 for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }

      // TP3 Check
      if (dbPos.tp3Price && dbPos.tp2Hit && !dbPos.tp3Hit) {
        const tp3Hit = isLong 
          ? currentPrice >= dbPos.tp3Price 
          : currentPrice <= dbPos.tp3Price;
        
        if (tp3Hit) {
          console.log(`   🎯 TP3 HIT @ ${dbPos.tp3Price}! Closing remaining position...`);
          
          const currentQty = dbPos.quantity;
          let closeOrderId: string | null = null;
          
          try {
            closeOrderId = await closePositionPartial(
              symbol, 
              side, 
              currentQty, 
              apiKey, 
              apiSecret
            );
            
            console.log(`   ✅ Closed remaining ${currentQty} @ market - Order: ${closeOrderId}`);
            
            await db.update(botPositions)
              .set({
                tp3Hit: true,
                status: "closed",
                closeReason: "tp3_hit",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp3_hit",
              reason: `Closed remaining @ ${currentPrice}`
            });

            // ✅ CRITICAL: Save to history with correct close reason
            await savePositionToHistory(
              dbPos,
              currentPrice,
              'tp3_hit',
              closeOrderId,
              apiKey,
              apiSecret
            );

            console.log(`🧹 Cleaning up orphaned orders for ${symbol}...`);
            const cleanupResult = await cleanupOrphanedOrders(
              symbol,
              apiKey,
              apiSecret,
              3
            );

            if (!cleanupResult.success) {
              console.error(`⚠️ Cleanup failed for ${symbol}: ${cleanupResult.errors.join(', ')}`);
              
              await db.insert(symbolLocks).values({
                symbol,
                lockReason: 'order_cleanup_failed',
                lockedAt: new Date().toISOString(),
                failureCount: cleanupResult.failedCount,
                lastError: cleanupResult.errors[0] || 'Unknown cleanup error',
                isPermanent: false,
                createdAt: new Date().toISOString(),
              });

              console.log(`🚫 Symbol ${symbol} LOCKED due to cleanup failure`);
            } else {
              console.log(`✅ Cleanup successful: ${cleanupResult.cancelledCount} orders cancelled`);
            }
            
          } catch (error: any) {
            const errMsg = `Failed to close TP3 for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }

      // ============================================
      // 🛡️ CHECK AND FIX MISSING SL/TP WITH LIMITER
      // ============================================

      // ✅ CRITICAL FIX: Check SL/TP from position data, not from algo orders
      // Because we use /v5/position/trading-stop, SL/TP are stored on position, not as separate orders
      const hasSL = bybitPos.stopLoss && bybitPos.stopLoss !== '' && parseFloat(bybitPos.stopLoss) > 0;
      const hasTP = bybitPos.takeProfit && bybitPos.takeProfit !== '' && parseFloat(bybitPos.takeProfit) > 0;

      console.log(`   🔍 Position SL/TP: SL=${hasSL ? bybitPos.stopLoss : 'MISSING'}, TP=${hasTP ? bybitPos.takeProfit : 'MISSING'}`);

      const positionAge = Date.now() - new Date(dbPos.openedAt).getTime();
      const positionAgeSeconds = positionAge / 1000;
      
      console.log(`   ⏱️ Position age: ${positionAgeSeconds.toFixed(0)}s`);

      // 🚨 CRITICAL SAFETY CHECK: If position is older than 30s and still missing SL/TP, FORCE CLOSE
      if ((!hasSL || !hasTP) && positionAgeSeconds > 30) {
        console.error(`   🚨🚨🚨 CRITICAL: Position ${symbol} missing ${!hasSL ? 'SL' : ''} ${!hasTP ? 'TP' : ''} for ${positionAgeSeconds.toFixed(0)}s!`);
        console.error(`   ⚠️ SAFETY PROTOCOL: This position will be CLOSED if SL/TP cannot be set within 3 attempts`);
        
        // Log critical alert to Oko actions
        await logOkoAction(
          dbPos.id,
          'CRITICAL_MISSING_SLTP',
          'missing_sl_tp_critical',
          `Position ${symbol} missing ${!hasSL ? 'SL' : ''}${!hasSL && !hasTP ? ' and ' : ''}${!hasTP ? 'TP' : ''} for ${positionAgeSeconds.toFixed(0)}s - attempting emergency repair`,
          1,
          {
            symbol,
            age: positionAgeSeconds,
            hasSL,
            hasTP,
            entryPrice: dbPos.entryPrice,
            currentPrice,
            unrealisedPnl: livePnl
          }
        );
      }

      if (!hasSL || !hasTP) {
        console.log(`   ⚠️ MISSING ${!hasSL ? 'SL' : ''} ${!hasTP ? 'TP' : ''} - checking repair limiter...`);
        
        // ✅ REPAIR LIMITS: 3 attempts per 10 minutes
        const shouldAttemptSlRepair = !hasSL && shouldAttemptRepair(dbPos.id, 'missing_sl_tp', 3, 10);
        const shouldAttemptTpRepair = !hasTP && shouldAttemptRepair(dbPos.id, 'missing_sl_tp', 3, 10);
        
        if (!shouldAttemptSlRepair && !hasSL) {
          console.log(`   ⛔ [LIMITER] Max SL repair attempts reached (3/3) - EMERGENCY CLOSE REQUIRED`);
          
          // 🚨 SAFETY PROTOCOL: If we can't set SL after 3 attempts, CLOSE THE POSITION
          if (positionAgeSeconds > 30) {
            console.error(`   🚨 EMERGENCY: Closing position ${symbol} - cannot set SL after 3 attempts!`);
            
            try {
              // Step 1: Close the position
              const closeOrderId = await closePositionPartial(symbol, side, quantity, apiKey, apiSecret);
              console.log(`   📋 Close order submitted: ${closeOrderId}`);
              
              // Step 2: 🛡️ CRITICAL - VERIFY position is actually closed
              const verification = await verifyPositionClosed(symbol, apiKey, apiSecret, 5, 2000);
              
              if (!verification.isClosed) {
                // 🚨🚨🚨 CRITICAL FAILURE - Position still open!
                console.error(`   ❌❌❌ CRITICAL: Position ${symbol} STILL OPEN after close attempt!`);
                console.error(`   Final size: ${verification.finalSize}`);
                console.error(`   Error: ${verification.error}`);
                
                // ✅✅✅ ALWAYS LOG TO DIAGNOSTICS - EVEN IF EVERYTHING ELSE FAILS
                try {
                  await db.insert(diagnosticFailures).values({
                    positionId: dbPos.id,
                    failureType: 'emergency_close_verification_failed',
                    severity: 'critical',
                    errorMessage: `Position ${symbol} still open after close - Size: ${verification.finalSize}, Error: ${verification.error}`,
                    metadata: {
                      symbol,
                      closeOrderId,
                      finalSize: verification.finalSize,
                      verificationError: verification.error,
                      timestamp: new Date().toISOString()
                    },
                    createdAt: new Date().toISOString(),
                  });
                } catch (logError: any) {
                  console.error(`   ❌ Failed to log diagnostic failure: ${logError.message}`);
                }
                
                await logOkoAction(
                  dbPos.id,
                  'CLOSE_VERIFICATION_FAILED',
                  'emergency_close_failed',
                  `CRITICAL: Emergency close failed - position still open (size: ${verification.finalSize})`,
                  1,
                  { 
                    symbol, 
                    closeOrderId, 
                    finalSize: verification.finalSize,
                    verificationError: verification.error 
                  }
                );
                
                // DO NOT mark as closed in DB - keep it for retry
                // DO NOT ban symbol - we need to keep trying
                errors.push(`CRITICAL: ${symbol} - Emergency close verification failed`);
                continue;
              }
              
              // ✅ Verification passed - position is actually closed
              console.log(`   ✅✅✅ VERIFIED: Position ${symbol} is closed on exchange`);
              
              // Step 3: Mark as closed in DB
              await db.update(botPositions)
                .set({
                  status: "closed",
                  closeReason: "emergency_no_sl",
                  closedAt: new Date().toISOString(),
                })
                .where(eq(botPositions.id, dbPos.id));

              // Step 4: Save to history
              await savePositionToHistory(dbPos, currentPrice, 'emergency_no_sl', closeOrderId, apiKey, apiSecret);
              
              // Step 5: Cleanup orphaned orders
              await cleanupOrphanedOrders(symbol, apiKey, apiSecret, 3);
              
              emergencyClosed++;
              okoActions++;
              
              await logOkoAction(
                dbPos.id,
                'EMERGENCY_CLOSE',
                'no_sl_emergency_close',
                `Position closed after failing to set SL (3 attempts failed) - VERIFIED CLOSED`,
                1,
                { symbol, attempts: 3, pnl: livePnl, closeOrderId, verified: true }
              );
              
              // Step 6: NOW we can safely ban the symbol
              await banSymbol(
                symbol,
                `Critical: Failed to set SL after 3 attempts - position verified closed`,
                48 // 48 hour ban
              );
              
              console.log(`   🚫 Symbol ${symbol} BANNED (position safely closed and verified)`);
              
              details.push({
                symbol,
                side,
                action: "emergency_no_sl",
                reason: "Failed to set SL after 3 attempts - closed for safety (verified)"
              });
              
              console.log(`   ✅ Position CLOSED and VERIFIED - symbol banned`);
              continue;
              
            } catch (error: any) {
              console.error(`   ❌ CRITICAL: Failed to close position without SL: ${error.message}`);
              
              // ✅✅✅ ALWAYS LOG TO DIAGNOSTICS - EVEN IF EVERYTHING ELSE FAILS
              try {
                await db.insert(diagnosticFailures).values({
                  positionId: dbPos.id,
                  failureType: 'emergency_close_exception',
                  severity: 'critical',
                  errorMessage: `Emergency close threw exception: ${error.message}`,
                  metadata: {
                    symbol,
                    side,
                    quantity,
                    entryPrice: dbPos.entryPrice,
                    currentPrice,
                    unrealisedPnl: livePnl,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                  },
                  createdAt: new Date().toISOString(),
                });
                console.log(`   ✅ Diagnostic failure logged to database`);
              } catch (logError: any) {
                console.error(`   ❌ Failed to log diagnostic failure: ${logError.message}`);
                // If we can't even log to DB, at least log to console
                console.error(`   📋 CRITICAL UNLOGGED ERROR:`, {
                  positionId: dbPos.id,
                  symbol,
                  error: error.message,
                  stack: error.stack
                });
              }
              
              errors.push(`CRITICAL: ${symbol} - Failed to close position without SL`);
              
              await logOkoAction(
                dbPos.id,
                'EMERGENCY_CLOSE_ERROR',
                'emergency_close_exception',
                `Exception during emergency close: ${error.message}`,
                1,
                { symbol, error: error.message, stack: error.stack }
              );
              
              // DO NOT ban symbol if we couldn't close - keep position in DB for retry
            }
          }
        }
        
        if (!shouldAttemptTpRepair && !hasTP) {
          console.log(`   ⛔ [LIMITER] Max TP repair attempts reached (3/3) - continuing without TP`);
          // TP is less critical than SL, so we don't force close
        }

        if (!shouldAttemptSlRepair && !shouldAttemptTpRepair) {
          console.log(`   ⏭️ Skipping repair - waiting for cooldown period`);
          
          // 🚨 But if position is old and missing SL, this is critical
          if (!hasSL && positionAgeSeconds > 60) {
            console.error(`   🚨 CRITICAL: Position ${symbol} has been without SL for ${positionAgeSeconds.toFixed(0)}s!`);
            console.error(`   ⚠️ This position is at HIGH RISK - manual intervention may be required`);
            
            await logOkoAction(
              dbPos.id,
              'HIGH_RISK',
              'no_sl_high_risk',
              `Position without SL for ${positionAgeSeconds.toFixed(0)}s - all repair attempts exhausted`,
              1,
              { symbol, age: positionAgeSeconds, unrealisedPnl: livePnl }
            );
          }
          
          continue;
        }
        
        const retryAttempts = await db.select()
          .from(tpslRetryAttempts)
          .where(eq(tpslRetryAttempts.positionId, dbPos.id));
        
        const slAttempts = retryAttempts.filter(r => r.orderType === 'sl' && !r.success).length;
        const tpAttempts = retryAttempts.filter(r => r.orderType === 'tp1' && !r.success).length;
        
        console.log(`   📊 Repair attempts so far: SL=${slAttempts}/3, TP=${tpAttempts}/3`);
        
        const slRR = config.defaultSlRR || 1.0;
        const nextTpRR = !dbPos.tp1Hit ? (config.tp1RR || 1.0) 
                        : !dbPos.tp2Hit ? (config.tp2RR || 2.0)
                        : (config.tp3RR || 3.0);
        
        let newSL: number;
        let newTP: number;
        
        if (isLong) {
          newSL = entryPrice * (1 - slRR / 100);
          newTP = entryPrice * (1 + nextTpRR / 100);
        } else {
          newSL = entryPrice * (1 + slRR / 100);
          newTP = entryPrice * (1 - nextTpRR / 100);
        }
        
        const slAlreadyHit = isLong 
          ? currentPrice <= newSL 
          : currentPrice >= newSL;
          
        const tpAlreadyHit = isLong 
          ? currentPrice >= newTP 
          : currentPrice <= newTP;
        
        if (slAlreadyHit) {
          console.error(`   ⚠️ SL ALREADY HIT! Closing position immediately...`);
          
          try {
            const closeOrderId = await closePositionPartial(symbol, side, quantity, apiKey, apiSecret);
            
            await db.update(botPositions)
              .set({
                status: "closed",
                closeReason: "sl_hit",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));

            await savePositionToHistory(dbPos, currentPrice, 'sl_hit', closeOrderId, apiKey, apiSecret);
            await cleanupOrphanedOrders(symbol, apiKey, apiSecret, 3);
            
            emergencyClosed++;
            
            await logOkoAction(
              dbPos.id,
              'SL_HIT',
              'sl_already_hit',
              `Position closed - SL already hit before order could be placed`,
              1,
              { symbol, slPrice: newSL, currentPrice, pnl: livePnl }
            );
            
            continue;
          } catch (error: any) {
            console.error(`   ❌ ${error.message}`);
            errors.push(error.message);
            continue;
          }
        }
        
        if (tpAlreadyHit) {
          console.log(`   🎯 TP ALREADY HIT! Current: ${currentPrice}, TP: ${newTP.toFixed(4)} - CLOSING PARTIAL`);
          
          const closePercent = config.tp1Percent || 50.0;
          const closeQty = (quantity * closePercent) / 100;
          
          try {
            const orderId = await closePositionPartial(
              symbol, 
              side, 
              closeQty, 
              apiKey, 
              apiSecret
            );
            
            console.log(`   ✅ Closed ${closePercent}% @ market due to TP hit - Order: ${orderId}`);
            
            await db.update(botPositions)
              .set({
                tp1Hit: true,
                quantity: quantity - closeQty,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp_hit_closed",
              reason: `Closed ${closePercent}% - TP already hit @ ${currentPrice}`
            });
            
            if (config.slManagementAfterTp1 === "breakeven") {
              newSL = entryPrice;
            }
          } catch (error: any) {
            const errMsg = `Failed to close partial at TP for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
        
        // 🚨 PRIORITY: Set SL first (critical for safety)
        if (!hasSL && !slAlreadyHit && shouldAttemptSlRepair) {
          console.log(`   🔧 [PRIORITY] Setting SL (attempt ${slAttempts + 1}/3) - CRITICAL FOR SAFETY...`);
          
          const slAlgoId = await setAlgoOrderWithRetry(
            symbol,
            side,
            dbPos.quantity,
            newSL,
            "sl",
            dbPos.id,
            apiKey,
            apiSecret,
            3
          );
          
          if (slAlgoId) {
            console.log(`   ✅ SL FIXED @ ${newSL.toFixed(4)}`);
            slTpFixed++;
            clearRepairAttempts(dbPos.id, 'missing_sl_tp');
            
            await logOkoAction(
              dbPos.id,
              'SL_REPAIRED',
              'sl_repair_success',
              `SL successfully set @ ${newSL.toFixed(4)} after ${slAttempts + 1} attempts`,
              1,
              { symbol, slPrice: newSL, attempts: slAttempts + 1 }
            );
          } else {
            console.error(`   ⚠️ Failed to set SL (attempt ${slAttempts + 1}/3) - will retry on next monitor cycle`);
            
            await logOkoAction(
              dbPos.id,
              'SL_REPAIR_FAILED',
              'sl_repair_attempt_failed',
              `Failed to set SL (attempt ${slAttempts + 1}/3)`,
              0,
              { symbol, slPrice: newSL, attempts: slAttempts + 1 }
            );
          }
        }
        
        // Set TP (less critical but still important)
        if (!hasTP && !tpAlreadyHit && shouldAttemptTpRepair) {
          console.log(`   🔧 Setting TP (attempt ${tpAttempts + 1}/3)...`);
          
          const tpAlgoId = await setAlgoOrderWithRetry(
            symbol,
            side,
            dbPos.quantity,
            newTP,
            "tp",
            dbPos.id,
            apiKey,
            apiSecret,
            3
          );

          if (tpAlgoId) {
            console.log(`   ✅ TP FIXED @ ${newTP.toFixed(4)}`);
            slTpFixed++;
            clearRepairAttempts(dbPos.id, 'missing_sl_tp');
            
            await logOkoAction(
              dbPos.id,
              'TP_REPAIRED',
              'tp_repair_success',
              `TP successfully set @ ${newTP.toFixed(4)} after ${tpAttempts + 1} attempts`,
              1,
              { symbol, tpPrice: newTP, attempts: tpAttempts + 1 }
            );
          } else {
            console.error(`   ⚠️ Failed to set TP (attempt ${tpAttempts + 1}/3) - will retry on next monitor cycle`);
          }
        }
      } else {
        console.log(`   ✅ Position has both SL and TP - OK`);
        clearRepairAttempts(dbPos.id, 'missing_sl_tp');
        
        // 🆕 VERIFY SL/TP are at correct levels (detect if they were modified/removed externally)
        const expectedSL = dbPos.currentSl || dbPos.stopLoss;
        const actualSL = parseFloat(bybitPos.stopLoss);
        const slDifference = Math.abs(actualSL - expectedSL);
        const slDifferencePercent = (slDifference / expectedSL) * 100;
        
        if (slDifferencePercent > 0.1) { // More than 0.1% difference
          console.warn(`   ⚠️ SL MISMATCH: Expected ${expectedSL.toFixed(4)}, Actual ${actualSL.toFixed(4)} (${slDifferencePercent.toFixed(2)}% diff)`);
          
          await logOkoAction(
            dbPos.id,
            'SL_MISMATCH',
            'sl_price_mismatch',
            `SL price mismatch detected: Expected ${expectedSL.toFixed(4)}, Actual ${actualSL.toFixed(4)}`,
            1,
            { symbol, expectedSL, actualSL, difference: slDifference }
          );
          
          // Update DB with actual SL
          await db.update(botPositions)
            .set({ currentSl: actualSL })
            .where(eq(botPositions.id, dbPos.id));
        }
      }

      const symbolLock = activeLocks.find(lock => lock.symbol === symbol);
      if (symbolLock && positionAgeSeconds > 120) {
        console.log(`   🚫 Symbol ${symbol} is LOCKED (${symbolLock.lockReason}) and position > 120s - skipping further checks`);
        continue;
      }
    }

    clearOldConfirmations();

    console.log(`\n✅ [MONITOR] Completed - TP Hits: ${tpHits}, SL Adj: ${slAdjustments}, Fixed: ${slTpFixed}, Emergency Closed: ${emergencyClosed}, Oko Actions: ${okoActions}, Ghost Orders: ${ghostCleanupResult.cleaned}`);
    if (errors.length > 0) {
      console.error(`⚠️ [MONITOR] Errors encountered: ${errors.length}`);
    }

    return {
      success: true,
      checked: dbPositions.length,
      tpHits,
      slAdjustments,
      slTpFixed,
      emergencyClosed,
      okoActions,
      ghostOrdersCleaned: ghostCleanupResult.cleaned,
      manualImported: importResult.imported,
      errors,
      details,
    };

  } catch (error: any) {
    console.error("❌ [MONITOR] Fatal error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export const monitorAllPositions = monitorAndManagePositions;