import { db } from '@/db';
import { botSettings, botPositions, botLogs, positionHistory, symbolLocks, diagnosticFailures, tpslRetryAttempts } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { okxRateLimiter } from './rate-limiter';
import { classifyOkxError } from './error-classifier';
import { cleanupOrphanedOrders, getRealizedPnlFromOkx } from './okx-helpers';
import {
  runOkoGuard,
  runAccountOkoGuard,
  incrementCapitulationCounter,
  banSymbol,
  logOkoAction,
  clearOldConfirmations
} from './oko-saurona';

// ============================================
// 🔐 OKX SIGNATURE HELPER
// ============================================

function createOkxSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('base64');
}

// ============================================
// 📊 GET CURRENT MARKET PRICE
// ============================================

async function getCurrentPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<number> {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = `/api/v5/market/ticker`;
  const queryString = `?instId=${symbol}`;
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }
  
  const response = await fetch(`https://www.okx.com${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0" || !data.data || data.data.length === 0) {
    throw new Error(`Failed to get price for ${symbol}`);
  }

  return parseFloat(data.data[0].last);
}

// ============================================
// 🏦 GET ALGO ORDERS (CHECK EXISTING SL/TP)
// ============================================

async function getAlgoOrders(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<any[]> {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/trade/orders-algo-pending";
  const queryString = "?ordType=conditional";
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }
  
  const response = await fetch(`https://www.okx.com${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0") {
    console.error(`Failed to get algo orders: ${data.msg}`);
    return [];
  }

  return data.data || [];
}

// ============================================
// 🔨 CLOSE POSITION PARTIALLY (MARKET ORDER)
// ============================================

async function closePositionPartial(
  symbol: string,
  side: string,
  quantity: number,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<string> {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/order";
  
  const payload = {
    instId: symbol,
    tdMode: "cross",
    side: side === "BUY" ? "sell" : "buy", // Opposite side to close
    ordType: "market",
    sz: quantity.toString(),
    posSide: side === "BUY" ? "long" : "short",
  };

  const bodyString = JSON.stringify(payload);
  const signature = createOkxSignature(timestamp, method, requestPath, bodyString, apiSecret);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  const response = await fetch(`https://www.okx.com${requestPath}`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  if (data.code !== "0") {
    throw new Error(`Failed to close position: ${data.msg} (code: ${data.code})`);
  }

  return data.data?.[0]?.ordId || "unknown";
}

// ============================================
// 🔄 CANCEL ALGO ORDER
// ============================================

async function cancelAlgoOrder(
  algoId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/cancel-algos";
  
  const payload = [{
    algoId,
    instId: symbol,
  }];

  const bodyString = JSON.stringify(payload);
  const signature = createOkxSignature(timestamp, method, requestPath, bodyString, apiSecret);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  const response = await fetch(`https://www.okx.com${requestPath}`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  return data.code === "0";
}

// ============================================
// 🔄 CANCEL ALGO ORDER WITH RETRY
// ============================================

async function cancelAlgoOrderWithRetry(
  algoId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  maxRetries = 3
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await cancelAlgoOrder(algoId, symbol, apiKey, apiSecret, passphrase, demo);
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
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<string | null> {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/order-algo";
  
  const algoSide = side === "BUY" ? "sell" : "buy";
  
  // ⚠️ CRITICAL: Do NOT use posSide in net mode (most OKX accounts)
  // In net mode, OKX infers position direction from the order side
  const payload: any = {
    instId: symbol,
    tdMode: "cross",
    side: algoSide,
    ordType: "conditional",
    sz: quantity.toString(),
  };

  if (orderType === "sl") {
    payload.slTriggerPx = triggerPrice.toString();
    payload.slOrdPx = "-1"; // Market order when triggered
  } else {
    payload.tpTriggerPx = triggerPrice.toString();
    payload.tpOrdPx = "-1"; // Market order when triggered
  }

  const bodyString = JSON.stringify(payload);
  const signature = createOkxSignature(timestamp, method, requestPath, bodyString, apiSecret);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  console.error(`🔧 [SET_ALGO] Setting ${orderType.toUpperCase()} for ${symbol}`);
  console.error(`   Payload: ${JSON.stringify(payload, null, 2)}`);
  console.error(`   Demo mode: ${demo}`);

  const response = await fetch(`https://www.okx.com${requestPath}`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  console.error(`📥 [SET_ALGO] OKX Response:`);
  console.error(`   Code: ${data.code}`);
  console.error(`   Message: ${data.msg}`);
  console.error(`   Full response: ${JSON.stringify(data, null, 2)}`);

  if (data.code !== "0") {
    console.error(`❌ [SET_ALGO] Failed to set ${orderType.toUpperCase()}: ${data.msg} (code: ${data.code})`);
    return null;
  }

  const algoId = data.data?.[0]?.algoId || null;
  
  if (!algoId) {
    console.error(`❌ [SET_ALGO] Success code but no algoId returned!`);
    console.error(`   Data array: ${JSON.stringify(data.data, null, 2)}`);
  } else {
    console.error(`✅ [SET_ALGO] Successfully set ${orderType.toUpperCase()} - Algo ID: ${algoId}`);
  }

  return algoId;
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
  passphrase: string,
  demo: boolean,
  maxRetries = 3
): Promise<string | null> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔧 [RETRY ${attempt}/${maxRetries}] Setting ${orderType.toUpperCase()} @ ${triggerPrice.toFixed(4)}...`);

      // ✅ CRITICAL FIX: Cancel ALL existing orders of this type BEFORE setting new one
      // This prevents duplicate TP/SL orders from accumulating
      if (attempt === 1) {
        console.log(`🧹 [CLEANUP] Cancelling all existing ${orderType.toUpperCase()} orders for ${symbol}...`);
        const existingOrders = await getAlgoOrders(apiKey, apiSecret, passphrase, demo);
        const ordersToCancel = existingOrders.filter((order: any) => {
          const matchesSymbol = order.instId === symbol;
          const matchesType = orderType === 'sl' ? !!order.slTriggerPx : !!order.tpTriggerPx;
          return matchesSymbol && matchesType;
        });
        
        console.log(`   Found ${ordersToCancel.length} existing ${orderType.toUpperCase()} orders to cancel`);
        
        for (const order of ordersToCancel) {
          const cancelled = await cancelAlgoOrderWithRetry(
            order.algoId,
            symbol,
            apiKey,
            apiSecret,
            passphrase,
            demo,
            2 // Quick retry
          );
          
          if (cancelled) {
            console.log(`   ✅ Cancelled old ${orderType.toUpperCase()} order: ${order.algoId}`);
          } else {
            console.warn(`   ⚠️ Failed to cancel ${order.algoId}, continuing anyway...`);
          }
        }
      }

      const algoId = await setAlgoOrder(
        symbol,
        side,
        quantity,
        triggerPrice,
        orderType,
        apiKey,
        apiSecret,
        passphrase,
        demo
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
        throw new Error('API returned null algoId');
      }
    } catch (error: any) {
      lastError = error;
      
      // Classify error
      const classified = classifyOkxError(
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
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<void> {
  try {
    console.log(`💾 Saving position ${dbPos.id} to history...`);

    const openedAt = new Date(dbPos.openedAt);
    const closedAt = new Date();
    const durationMinutes = Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);

    // Try to get realized PnL from OKX
    let realizedPnl: number | null = null;
    let finalClosePrice = currentPrice;

    if (closeOrderId) {
      const pnlData = await getRealizedPnlFromOkx(
        closeOrderId,
        dbPos.symbol.includes('-') ? dbPos.symbol : `${dbPos.symbol.replace('USDT', '')}-USDT-SWAP`,
        apiKey,
        apiSecret,
        passphrase,
        demo
      );

      if (pnlData) {
        realizedPnl = pnlData.realizedPnl;
        finalClosePrice = pnlData.fillPrice;
        console.log(`✅ Got realized PnL from OKX: ${realizedPnl.toFixed(2)} USD`);
      }
    }

    // Fallback: Calculate estimated PnL
    if (realizedPnl === null) {
      const isLong = dbPos.side === 'BUY';
      const priceDiff = isLong 
        ? (finalClosePrice - dbPos.entryPrice) 
        : (dbPos.entryPrice - finalClosePrice);
      
      realizedPnl = priceDiff * dbPos.quantity;
      console.log(`⚠️ Using estimated PnL: ${realizedPnl.toFixed(2)} USD (no OKX data)`);
    }

    const pnlPercent = (realizedPnl / dbPos.initialMargin) * 100;

    // Insert to positionHistory
    await db.insert(positionHistory).values({
      positionId: dbPos.id,
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
    });

    console.log(`✅ Position saved to history: PnL ${realizedPnl.toFixed(2)} USD (${pnlPercent.toFixed(2)}%), Duration: ${durationMinutes}min`);
  } catch (error: any) {
    console.error(`❌ Failed to save position to history:`, error.message);
    // Don't throw - position is already closed, just log error
  }
}

// ============================================
// 🏦 GET OPEN POSITIONS FROM OKX
// ============================================

async function getOkxPositions(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/positions";
  const queryString = "?instType=SWAP";
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }
  
  const response = await fetch(`https://www.okx.com${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0") {
    return [];
  }

  return data.data?.filter((p: any) => parseFloat(p.pos) !== 0) || [];
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
    const passphrase = config.passphrase!;
    const demo = config.environment === "demo";

    // 🆕 FAZA 2: Prepare credentials for Oko
    const credentials = {
      apiKey,
      apiSecret,
      passphrase,
      demo,
    };

    // Get bot positions from DB
    const dbPositions = await db.select()
      .from(botPositions)
      .where(eq(botPositions.status, "open"));

    console.log(`📊 [MONITOR] Found ${dbPositions.length} open positions in database`);

    if (dbPositions.length === 0) {
      return { success: true, checked: 0, tpHits: 0, slAdjustments: 0, slTpFixed: 0, emergencyClosed: 0, okoActions: 0 };
    }

    // Get OKX positions
    const okxPositions = await getOkxPositions(apiKey, apiSecret, passphrase, demo);
    
    // Get existing algo orders
    const algoOrders = await getAlgoOrders(apiKey, apiSecret, passphrase, demo);
    
    console.log(`📊 [MONITOR] OKX Positions: ${okxPositions.length}, Algo Orders: ${algoOrders.length}`);

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
      const symbol = dbPos.symbol.includes("-") ? dbPos.symbol : `${dbPos.symbol.replace("USDT", "")}-USDT-SWAP`;
      const okxPos = okxPositions.find((p: any) => p.instId === symbol);
      
      if (!okxPos) return null;
      
      const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret, passphrase, demo);
      
      return {
        id: dbPos.id,
        symbol: dbPos.symbol,
        side: dbPos.side,
        entryPrice: dbPos.entryPrice,
        currentPrice,
        quantity: Math.abs(parseFloat(okxPos.pos)),
        stopLoss: dbPos.stopLoss,
        currentSl: dbPos.currentSl,
        unrealisedPnl: parseFloat(okxPos.upl || "0"),
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
        const symbol = dbPos.symbol.includes("-") ? dbPos.symbol : `${dbPos.symbol.replace("USDT", "")}-USDT-SWAP`;
        
        try {
          const closeOrderId = await closePositionPartial(
            symbol,
            dbPos.side,
            dbPos.quantity,
            apiKey,
            apiSecret,
            passphrase,
            demo
          );
          
          await db.update(botPositions)
            .set({
              status: "closed",
              closeReason: "oko_account_drawdown",
              closedAt: new Date().toISOString(),
            })
            .where(eq(botPositions.id, dbPos.id));

          const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret, passphrase, demo);
          await savePositionToHistory(dbPos, currentPrice, 'oko_account_drawdown', closeOrderId, apiKey, apiSecret, passphrase, demo);
          await cleanupOrphanedOrders(symbol, apiKey, apiSecret, passphrase, demo, 3);
          
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
      const symbol = dbPos.symbol.includes("-") ? dbPos.symbol : `${dbPos.symbol.replace("USDT", "")}-USDT-SWAP`;
      
      console.log(`\n🔍 [MONITOR] Checking ${symbol} (${dbPos.side})...`);

      // Find matching OKX position
      const okxPos = okxPositions.find((p: any) => p.instId === symbol);
      
      if (!okxPos) {
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
      const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret, passphrase, demo);
      const quantity = Math.abs(parseFloat(okxPos.pos));
      const side = dbPos.side;
      const entryPrice = dbPos.entryPrice;
      
      // ✅ Update DB with live PnL from OKX
      const livePnl = parseFloat(okxPos.upl || "0");
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
      // 👁️ OKO SAURONA: POSITION-LEVEL CHECKS (WITH FAZA 2)
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

      // 🆕 FAZA 2: Pass credentials to Oko
      const okoResult = await runOkoGuard(positionData, validPositionData, credentials);
      
      // ============================================
      // 🆕 FAZA 2: HANDLE REPAIR ACTIONS (shouldFix)
      // ============================================
      
      if (okoResult.shouldFix) {
        console.log(`🔧 [OKO] Repair action required: ${okoResult.action}`);
        console.log(`   Reason: ${okoResult.reason}`);
        
        if (okoResult.action === 'missing_sl_tp') {
          // Missing SL/TP detected - let existing repair logic handle it
          console.log(`   ℹ️ [OKO] Missing SL/TP will be handled by existing repair logic below`);
          // Don't skip - continue to repair section
        } else if (okoResult.action === 'tp1_quantity_fix') {
          // TP1 Quantity mismatch - update DB
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
            apiSecret,
            passphrase,
            demo
          );
          
          await db.update(botPositions)
            .set({
              status: "closed",
              closeReason: `oko_${okoResult.action}`,
              closedAt: new Date().toISOString(),
            })
            .where(eq(botPositions.id, dbPos.id));

          await savePositionToHistory(
            dbPos,
            currentPrice,
            `oko_${okoResult.action}`,
            closeOrderId,
            apiKey,
            apiSecret,
            passphrase,
            demo
          );

          await cleanupOrphanedOrders(symbol, apiKey, apiSecret, passphrase, demo, 3);
          
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
          
          // Increment capitulation counter
          const newCounter = await incrementCapitulationCounter();
          
          // Check if capitulation threshold reached
          const okoSettings = config;
          const capitulationThreshold = okoSettings.okoCapitulationThreshold || 3;
          
          if (newCounter >= capitulationThreshold) {
            console.log(`🚨 [OKO] CAPITULATION THRESHOLD REACHED (${newCounter}/${capitulationThreshold})`);
            
            // Ban the symbol
            const banDuration = okoSettings.okoBanDurationHours || 24;
            await banSymbol(
              dbPos.symbol,
              `Capitulation after ${newCounter} Oko emergency closures`,
              banDuration
            );
            
            // Reset counter after ban
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
              apiSecret, 
              passphrase, 
              demo
            );
            
            console.log(`   ✅ Closed ${closePercent}% (${closeQty}) @ market - Order: ${orderId}`);
            
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
              action: "tp1_hit",
              reason: `Closed ${closePercent}% @ ${currentPrice}`
            });
            
            // Adjust SL based on strategy
            if (config.slManagementAfterTp1 === "breakeven") {
              console.log(`   📈 Moving SL to breakeven @ ${entryPrice}`);
              
              const slAlgos = algoOrders.filter((a: any) => 
                a.instId === symbol && a.slTriggerPx
              );
              
              for (const algo of slAlgos) {
                await cancelAlgoOrder(algo.algoId, symbol, apiKey, apiSecret, passphrase, demo);
              }
              
              await setAlgoOrder(
                symbol,
                side,
                quantity - closeQty,
                entryPrice,
                "sl",
                apiKey,
                apiSecret,
                passphrase,
                demo
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
              
              const slAlgos = algoOrders.filter((a: any) => 
                a.instId === symbol && a.slTriggerPx
              );
              
              for (const algo of slAlgos) {
                await cancelAlgoOrder(algo.algoId, symbol, apiKey, apiSecret, passphrase, demo);
              }
              
              await setAlgoOrder(
                symbol,
                side,
                quantity - closeQty,
                newSl,
                "sl",
                apiKey,
                apiSecret,
                passphrase,
                demo
              );
              
              await db.update(botPositions)
                .set({ currentSl: newSl })
                .where(eq(botPositions.id, dbPos.id));
              
              slAdjustments++;
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
              apiSecret, 
              passphrase, 
              demo
            );
            
            console.log(`   ✅ Closed ${closePercent}% (${closeQty}) @ market - Order: ${orderId}`);
            
            await db.update(botPositions)
              .set({
                tp2Hit: true,
                quantity: currentQty - closeQty,
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
              apiSecret, 
              passphrase, 
              demo
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

            // ✅ NEW: Save to history
            await savePositionToHistory(
              dbPos,
              currentPrice,
              'tp3_hit',
              closeOrderId,
              apiKey,
              apiSecret,
              passphrase,
              demo
            );

            // ✅ NEW: Cleanup orphaned orders
            console.log(`🧹 Cleaning up orphaned orders for ${symbol}...`);
            const cleanupResult = await cleanupOrphanedOrders(
              symbol,
              apiKey,
              apiSecret,
              passphrase,
              demo,
              3
            );

            if (!cleanupResult.success) {
              console.error(`⚠️ Cleanup failed for ${symbol}: ${cleanupResult.errors.join(', ')}`);
              
              // Lock symbol if cleanup failed
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
      // 🛡️ CRITICAL FIX: CHECK AND FIX MISSING SL/TP **BEFORE** CHECKING SYMBOL LOCK
      // ============================================

      const positionAlgos = algoOrders.filter((a: any) => a.instId === symbol);
      const hasSL = positionAlgos.some((a: any) => a.slTriggerPx);
      const hasTP = positionAlgos.some((a: any) => a.tpTriggerPx);

      console.log(`   🔍 Algo Orders: SL=${hasSL}, TP=${hasTP} (Total: ${positionAlgos.length})`);

      // ✅ NEW: Check position age and retry attempts
      const positionAge = Date.now() - new Date(dbPos.openedAt).getTime();
      const positionAgeSeconds = positionAge / 1000;
      
      console.log(`   ⏱️ Position age: ${positionAgeSeconds.toFixed(0)}s`);

      if (!hasSL || !hasTP) {
        console.log(`   ⚠️ MISSING ${!hasSL ? 'SL' : ''} ${!hasTP ? 'TP' : ''} - attempting repair...`);
        
        // ✅ NEW: Count previous repair attempts from tpslRetryAttempts table
        const retryAttempts = await db.select()
          .from(tpslRetryAttempts)
          .where(eq(tpslRetryAttempts.positionId, dbPos.id));
        
        const slAttempts = retryAttempts.filter(r => r.orderType === 'sl' && !r.success).length;
        const tpAttempts = retryAttempts.filter(r => r.orderType === 'tp1' && !r.success).length;
        
        console.log(`   📊 Repair attempts so far: SL=${slAttempts}, TP=${tpAttempts}`);
        
        // ✅ CRITICAL FIX: Increased timeout from 30s to 120s and max retries from 3 to 10
        if (positionAgeSeconds > 120 && (slAttempts >= 10 || tpAttempts >= 10)) {
          console.error(`   🚨 EMERGENCY: Position > 120s old with ${Math.max(slAttempts, tpAttempts)} failed repair attempts!`);
          console.error(`   → CLOSING POSITION AND LOCKING SYMBOL`);
          
          try {
            const closeOrderId = await closePositionPartial(symbol, side, dbPos.quantity, apiKey, apiSecret, passphrase, demo);
            
            await db.update(botPositions)
              .set({
                status: "closed",
                closeReason: "emergency_tpsl_failure_120s",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));

            // Log to diagnostic failures
            await db.insert(diagnosticFailures).values({
              positionId: dbPos.id,
              failureType: 'emergency_close_120s',
              reason: `Position > 120s without SL/TP after ${Math.max(slAttempts, tpAttempts)} repair attempts`,
              attemptCount: Math.max(slAttempts, tpAttempts),
              errorDetails: JSON.stringify({ 
                positionAgeSeconds: positionAgeSeconds.toFixed(0),
                slAttempts, 
                tpAttempts,
                hasSL,
                hasTP
              }),
              createdAt: new Date().toISOString(),
            });

            // Lock symbol permanently
            await db.insert(symbolLocks).values({
              symbol,
              lockReason: 'tpsl_failures_120s_timeout',
              lockedAt: new Date().toISOString(),
              failureCount: Math.max(slAttempts, tpAttempts),
              lastError: `Failed to set SL/TP after ${Math.max(slAttempts, tpAttempts)} attempts over 120+ seconds`,
              isPermanent: false,
              createdAt: new Date().toISOString(),
            });

            console.log(`🚫 Symbol ${symbol} LOCKED due to 120s TP/SL timeout`);
            
            emergencyClosed++;
            details.push({
              symbol,
              side,
              action: "emergency_closed_120s",
              reason: `Position > 120s without SL/TP after ${Math.max(slAttempts, tpAttempts)} repair attempts`
            });

            // ✅ Cleanup orphaned orders
            await cleanupOrphanedOrders(symbol, apiKey, apiSecret, passphrase, demo, 3);
            
            continue;
            
          } catch (closeError: any) {
            console.error(`   ❌ Emergency close failed:`, closeError.message);
            errors.push(`Emergency close failed for ${symbol}: ${closeError.message}`);
            continue;
          }
        }
        
        // ✅ CRITICAL FIX: If position < 120s old, give it more time
        if (positionAgeSeconds < 120) {
          console.log(`   ⏳ Position < 120s old - giving more time for SL/TP to propagate...`);
          // Don't skip - continue to check symbol lock below
        }
        
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
        
        // Check if already hit
        const slAlreadyHit = isLong 
          ? currentPrice <= newSL 
          : currentPrice >= newSL;
          
        const tpAlreadyHit = isLong 
          ? currentPrice >= newTP 
          : currentPrice <= newTP;
        
        if (slAlreadyHit) {
          console.error(`   ⚠️ SL ALREADY HIT! Closing position immediately...`);
          
          try {
            const closeOrderId = await closePositionPartial(symbol, side, quantity, apiKey, apiSecret, passphrase, demo);
            
            await db.update(botPositions)
              .set({
                status: "closed",
                closeReason: "sl_hit",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));

            // ✅ NEW: Save to history
            await savePositionToHistory(dbPos, currentPrice, 'sl_hit', closeOrderId, apiKey, apiSecret, passphrase, demo);

            // ✅ NEW: Cleanup orphaned orders
            await cleanupOrphanedOrders(symbol, apiKey, apiSecret, passphrase, demo, 3);
            
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
              apiSecret, 
              passphrase, 
              demo
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
            
            // After TP hit, recalculate SL with breakeven if configured
            if (config.slManagementAfterTp1 === "breakeven") {
              newSL = entryPrice;
            }
          } catch (error: any) {
            const errMsg = `Failed to close partial at TP for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
        
        // ✅ CRITICAL FIX: Use setAlgoOrderWithRetry (but only if < 10 previous attempts)
        if (!hasSL && !slAlreadyHit && slAttempts < 10) {
          console.log(`   🔧 Attempting to fix SL (attempt ${slAttempts + 1}/10)...`);
          
          const slAlgoId = await setAlgoOrderWithRetry(
            symbol,
            side,
            dbPos.quantity,
            newSL,
            "sl",
            dbPos.id,
            apiKey,
            apiSecret,
            passphrase,
            demo,
            3
          );
          
          if (slAlgoId) {
            console.log(`   ✅ SL FIXED @ ${newSL.toFixed(4)}`);
            slTpFixed++;
          } else {
            console.error(`   ⚠️ Failed to set SL - will retry on next monitor cycle`);
          }
        }
        
        // Similar for TP
        if (!hasTP && !tpAlreadyHit && tpAttempts < 10) {
          console.log(`   🔧 Attempting to fix TP (attempt ${tpAttempts + 1}/10)...`);
          
          const tpAlgoId = await setAlgoOrderWithRetry(
            symbol,
            side,
            dbPos.quantity,
            newTP,
            "tp",
            dbPos.id,
            apiKey,
            apiSecret,
            passphrase,
            demo,
            3
          );
          
          if (tpAlgoId) {
            console.log(`   ✅ TP FIXED @ ${newTP.toFixed(4)}`);
            slTpFixed++;
          } else {
            console.error(`   ⚠️ Failed to set TP - will retry on next monitor cycle`);
          }
        }
      } else {
        console.log(`   ✅ Position has both SL and TP - OK`);
      }

      // ============================================
      // 🚫 CRITICAL FIX: Check symbol lock AFTER attempting repairs
      // ============================================
      const symbolLock = activeLocks.find(lock => lock.symbol === symbol);
      if (symbolLock && positionAgeSeconds > 120) {
        console.log(`   🚫 Symbol ${symbol} is LOCKED (${symbolLock.lockReason}) and position > 120s - skipping further checks`);
        continue;
      }
    }

    // Clear old Oko confirmations
    clearOldConfirmations();

    console.log(`\n✅ [MONITOR] Completed - TP Hits: ${tpHits}, SL Adj: ${slAdjustments}, Fixed: ${slTpFixed}, Emergency Closed: ${emergencyClosed}, Oko Actions: ${okoActions}`);
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

// ✅ Export alias for compatibility with route handler
export const monitorAllPositions = monitorAndManagePositions;