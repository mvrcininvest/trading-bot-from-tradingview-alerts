import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions, botLogs, symbolLocks, botDetailedLogs, diagnosticFailures } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import crypto from 'crypto';
import { monitorAndManagePositions } from '@/lib/position-monitor';
import { classifyError } from '@/lib/error-classifier';
import { 
  resolveConflict, 
  lockSymbolForOpening, 
  markPositionOpened, 
  markPositionOpenFailed 
} from '@/lib/conflict-resolver';

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
// 🔄 SYMBOL CONVERSION FOR OKX
// ============================================

function convertSymbolToOkx(symbol: string): string {
  // If already in OKX format (contains hyphens), return as-is
  if (symbol.includes('-')) {
    console.log(`✅ Symbol already in OKX format: ${symbol}`);
    return symbol;
  }
  
  // Convert ETHUSDT -> ETH-USDT-SWAP
  // Convert BTCUSDT -> BTC-USDT-SWAP
  const match = symbol.match(/^([A-Z0-9]+)(USDT|USD)$/i);
  
  if (match) {
    const [, base, quote] = match;
    const okxFormat = `${base.toUpperCase()}-${quote.toUpperCase()}-SWAP`;
    console.log(`🔄 Symbol conversion: ${symbol} -> ${okxFormat}`);
    return okxFormat;
  }
  
  // If format is unclear, return as-is and let OKX API handle it
  console.warn(`⚠️ Unrecognized symbol format: ${symbol}, using as-is`);
  return symbol;
}

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

function snakeToCamel(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamel(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = snakeToCamel(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

async function logToBot(
  level: 'error' | 'warning' | 'info' | 'success',
  action: string,
  message: string,
  details?: any,
  alertId?: number,
  positionId?: number
) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    await db.insert(botLogs).values({
      timestamp,
      level,
      action,
      message,
      details: details ? JSON.stringify(details) : null,
      alertId: alertId || null,
      positionId: positionId || null,
      createdAt: timestamp,
    });
  } catch (error) {
    console.error('Failed to log to botLogs:', error);
  }
}

// ============================================
// 🔒 CHECK SYMBOL LOCKS
// ============================================

async function checkSymbolLock(symbol: string): Promise<{ locked: boolean; reason?: string }> {
  try {
    const locks = await db.select()
      .from(symbolLocks)
      .where(and(
        eq(symbolLocks.symbol, symbol),
        isNull(symbolLocks.unlockedAt)
      ))
      .limit(1);
    
    if (locks.length > 0) {
      const lock = locks[0];
      console.log(`🔒 Symbol ${symbol} is LOCKED: ${lock.lockReason}`);
      return { 
        locked: true, 
        reason: lock.lockReason 
      };
    }
    
    return { locked: false };
  } catch (error) {
    console.error('Failed to check symbol locks:', error);
    return { locked: false };
  }
}

// ============================================
// 🏦 OKX API HELPER
// ============================================

async function makeOkxRequest(
  method: string,
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  body?: any,
  alertId?: number
) {
  const timestamp = new Date().toISOString();
  const baseUrl = 'https://www.okx.com';
  const requestPath = endpoint;
  const bodyString = body ? JSON.stringify(body) : '';
  
  const signature = createOkxSignature(timestamp, method, requestPath, bodyString, apiSecret);

  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
  };

  if (demo) {
    headers['x-simulated-trading'] = '1';
  }

  console.log(`🔑 OKX ${method} ${endpoint}`, { 
    timestamp, 
    demo, 
    apiKeyPreview: apiKey.substring(0, 8) + '...',
    bodyPreview: bodyString.substring(0, 100) 
  });

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: bodyString || undefined,
  });

  const responseText = await response.text();
  console.log(`📥 OKX Response (${response.status}):`, responseText.substring(0, 500));

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    await logToBot('error', 'okx_parse_error', `OKX returned non-JSON: ${responseText.substring(0, 200)}`, { responseText: responseText.substring(0, 500) }, alertId);
    throw new Error(`OKX API returned invalid JSON: ${responseText.substring(0, 200)}`);
  }

  return { response, data };
}

// ============================================
// 📊 GET CURRENT MARKET PRICE FROM OKX
// ============================================

async function getCurrentMarketPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<number> {
  const okxSymbol = convertSymbolToOkx(symbol);
  
  try {
    const { data } = await makeOkxRequest(
      'GET',
      `/api/v5/market/ticker?instId=${okxSymbol}`,
      apiKey,
      apiSecret,
      passphrase,
      demo
    );
    
    if (data.code === '0' && data.data && data.data.length > 0) {
      const lastPrice = parseFloat(data.data[0].last);
      console.log(`📊 Current market price for ${okxSymbol}: ${lastPrice}`);
      return lastPrice;
    }
    
    throw new Error(`Failed to get market price for ${okxSymbol}`);
  } catch (error: any) {
    console.error(`❌ Failed to get market price:`, error.message);
    throw error;
  }
}

// ============================================
// 🚀 OKX POSITION OPENING (FIXED: TP strategy + SHORT validation + lot size)
// ============================================

async function openOkxPosition(
  symbol: string,
  side: string,
  positionSizeUsd: number,
  leverage: number,
  slPrice: number | null,
  tpPrice: number | null,
  entryPrice: number,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  alertId?: number,
  originalSl?: number,
  originalTp?: number,
  slMarginRiskPercent?: number
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 OPENING OKX POSITION - START`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Input:`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Position Size: $${positionSizeUsd}`);
  console.log(`   Entry Price: ${entryPrice}`);
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   SL: ${slPrice}, TP: ${tpPrice}`);
  console.log(`   SL Margin Risk %: ${slMarginRiskPercent || 'N/A'}`);
  console.log(`   Demo: ${demo}`);
  
  const okxSymbol = convertSymbolToOkx(symbol);
  
  // ============================================
  // 🔍 STEP 1: GET CURRENT MARKET PRICE
  // ============================================
  console.log(`\n🔍 Getting current market price for validation...`);
  let currentMarketPrice: number;
  try {
    currentMarketPrice = await getCurrentMarketPrice(symbol, apiKey, apiSecret, passphrase, demo);
    console.log(`✅ Current market price: ${currentMarketPrice}`);
  } catch (error: any) {
    console.error(`❌ Failed to get market price, using entry price as fallback`);
    currentMarketPrice = entryPrice;
  }
  
  // ============================================
  // 🔍 STEP 2: TEST CREDENTIALS
  // ============================================
  console.log(`\n🔍 Testing credentials with balance check...`);
  try {
    const { data: balanceData } = await makeOkxRequest(
      'GET',
      '/api/v5/account/balance',
      apiKey,
      apiSecret,
      passphrase,
      demo,
      undefined,
      alertId
    );
    
    if (balanceData.code !== '0') {
      throw new Error(`Credentials test failed: ${balanceData.msg} (code: ${balanceData.code})`);
    }
    
    console.log(`✅ Credentials valid - Account access successful`);
  } catch (error: any) {
    console.error(`❌ CREDENTIALS TEST FAILED:`, error.message);
    await logToBot('error', 'credentials_invalid', `Credentials rejected by OKX: ${error.message}`, {
      error: error.message,
      apiKeyPreview: apiKey.substring(0, 12) + '...'
    }, alertId);
    throw new Error(`OKX rejected credentials: ${error.message}. Go to /exchange-test and enter REAL OKX credentials.`);
  }
  
  // ============================================
  // 🔍 STEP 3: GET INSTRUMENT INFO
  // ============================================
  console.log(`\n🔍 Fetching instrument info for ${okxSymbol}...`);
  let instrumentInfo;
  try {
    const { data: instData } = await makeOkxRequest(
      'GET',
      `/api/v5/public/instruments?instType=SWAP&instId=${okxSymbol}`,
      apiKey,
      apiSecret,
      passphrase,
      demo,
      undefined,
      alertId
    );
    
    if (instData.code !== '0' || !instData.data || instData.data.length === 0) {
      throw new Error(`Instrument ${okxSymbol} not found on OKX`);
    }
    
    instrumentInfo = instData.data[0];
    console.log(`✅ Instrument found:`, {
      instId: instrumentInfo.instId,
      ctVal: instrumentInfo.ctVal,
      lotSz: instrumentInfo.lotSz,
      minSz: instrumentInfo.minSz,
      tickSz: instrumentInfo.tickSz
    });
  } catch (error: any) {
    console.error(`❌ Failed to get instrument info:`, error.message);
    await logToBot('error', 'instrument_not_found', `Instrument ${okxSymbol} not found: ${error.message}`, { symbol: okxSymbol }, alertId);
    throw error;
  }
  
  // ============================================
  // 🔢 STEP 4: CALCULATE QUANTITY (FIXED: Proper lot size rounding)
  // ============================================
  console.log(`\n🔢 Calculating order quantity...`);
  const ctVal = parseFloat(instrumentInfo.ctVal);
  const lotSz = parseFloat(instrumentInfo.lotSz);
  const minSz = parseFloat(instrumentInfo.minSz);
  const tickSz = parseFloat(instrumentInfo.tickSz);
  
  // Calculate lot size decimal precision
  const lotDecimals = lotSz.toString().includes('.') 
    ? lotSz.toString().split('.')[1].length 
    : 0;
  
  // Calculate required contracts
  const coinAmount = positionSizeUsd / currentMarketPrice;
  let contracts = coinAmount / ctVal;
  
  console.log(`   Coin amount needed: ${coinAmount}`);
  console.log(`   Contract value: ${ctVal}`);
  console.log(`   Raw contracts: ${contracts}`);
  console.log(`   Lot size: ${lotSz}, Min size: ${minSz}`);
  
  // ✅ CRITICAL FIX: Proper rounding to avoid floating point errors
  // Round DOWN to nearest lot size multiple first
  let roundedContracts = Math.floor(contracts / lotSz) * lotSz;
  
  // If below minimum, round UP
  if (roundedContracts < minSz) {
    roundedContracts = Math.ceil(minSz / lotSz) * lotSz;
  }
  
  // ✅ FIX: Use toFixed with proper decimals to avoid floating point artifacts like "1.7000000000000002"
  const finalContracts = parseFloat(roundedContracts.toFixed(lotDecimals));
  
  console.log(`   Rounded contracts: ${roundedContracts}`);
  console.log(`   Final contracts (string): ${finalContracts.toFixed(lotDecimals)}`);
  
  if (finalContracts < minSz) {
    throw new Error(`Calculated ${finalContracts} contracts is below minimum ${minSz} for ${okxSymbol}`);
  }
  
  // ✅ CRITICAL: Use toFixed string directly to avoid JS floating point issues
  const quantity = finalContracts.toFixed(lotDecimals);
  console.log(`   ✅ Final quantity string: "${quantity}"`);

  // ============================================
  // ✅ CRITICAL FIX #1: RECALCULATE SL/TP WITH ACTUAL QUANTITY
  // ============================================
  if (slMarginRiskPercent && slMarginRiskPercent > 0) {
    console.log(`\n🔧 RECALCULATING SL with actual quantity...`);
    
    const initialMargin = positionSizeUsd / leverage;
    const maxLossUsd = initialMargin * (slMarginRiskPercent / 100);
    
    // ✅ CRITICAL: Calculate SL with ACTUAL finalContracts, not theoretical coinAmount
    const actualCoinAmount = finalContracts * ctVal;
    const slPriceDistance = maxLossUsd / actualCoinAmount;
    
    console.log(`   Initial margin: $${initialMargin.toFixed(2)}`);
    console.log(`   Max loss (${slMarginRiskPercent}%): $${maxLossUsd.toFixed(2)}`);
    console.log(`   Actual coin amount: ${actualCoinAmount.toFixed(6)} (${finalContracts} contracts × ${ctVal})`);
    console.log(`   SL price distance: ${slPriceDistance.toFixed(6)}`);
    
    if (side === "BUY") {
      slPrice = entryPrice - slPriceDistance;
    } else {
      slPrice = entryPrice + slPriceDistance;
    }
    
    console.log(`   ✅ Recalculated SL: ${slPrice?.toFixed(4)}`);
    
    // Recalculate TP based on new SL distance (if using R:R mode)
    if (tpPrice) {
      const newSlDistance = Math.abs(entryPrice - (slPrice || entryPrice));
      const tpRR = 1.0; // Default TP1 R:R
      
      if (side === "BUY") {
        tpPrice = entryPrice + (newSlDistance * tpRR);
      } else {
        tpPrice = entryPrice - (newSlDistance * tpRR);
      }
      
      console.log(`   ✅ Recalculated TP1: ${tpPrice?.toFixed(4)} (1:1 R:R)`);
    }
    
    await logToBot('info', 'sl_recalculated', `SL recalculated with actual quantity: ${slPrice?.toFixed(4)}`, {
      initialMargin,
      maxLossUsd,
      actualCoinAmount,
      slPriceDistance,
      slPrice,
      tpPrice
    }, alertId);
  }
  
  // ============================================
  // 📏 STEP 5: SET LEVERAGE
  // ============================================
  console.log(`\n📏 Setting leverage to ${leverage}x...`);
  try {
    const { data: leverageData } = await makeOkxRequest(
      'POST',
      '/api/v5/account/set-leverage',
      apiKey,
      apiSecret,
      passphrase,
      demo,
      {
        instId: okxSymbol,
        lever: leverage.toString(),
        mgnMode: 'cross'
      },
      alertId
    );

    if (leverageData.code !== '0') {
      console.warn(`⚠️ Leverage response (code ${leverageData.code}): ${leverageData.msg}`);
      await logToBot('warning', 'leverage_warning', `Leverage: ${leverageData.msg}`, { leverageData }, alertId);
    } else {
      console.log(`✅ Leverage set: ${leverage}x`);
    }
  } catch (error: any) {
    console.error(`❌ Leverage failed:`, error.message);
    await logToBot('error', 'leverage_failed', `Leverage failed: ${error.message}`, { error: error.message }, alertId);
  }

  // ============================================
  // ✅ STEP 6: VALIDATE AND ADJUST TP/SL (CRITICAL FIX FOR SHORT)
  // ============================================
  console.log(`\n✅ Validating TP/SL against current market price...`);
  console.log(`   Side: ${side}, Current Market: ${currentMarketPrice}`);
  console.log(`   Original - TP: ${tpPrice}, SL: ${slPrice}`);
  
  if (slPrice && tpPrice) {
    const isBuy = side.toUpperCase() === "BUY";
    
    // Helper to format price to tick size
    const formatPrice = (price: number) => {
      const decimals = tickSz.toString().includes('.') 
        ? tickSz.toString().split('.')[1].length 
        : 0;
      return parseFloat(price.toFixed(decimals));
    };
    
    // ✅ CRITICAL FIX: Increased safety margin from 0.2% to 1.5% for OKX
    // ✅ OKX requires larger distance between market price and SL/TP
    if (isBuy) {
      // ========================================
      // BUY/LONG: TP ABOVE entry, SL BELOW entry
      // ========================================
      console.log(`   📈 LONG position validation...`);
      
      // TP must be ABOVE current price with 1.5% safety margin
      const minTpPrice = currentMarketPrice * 1.015; // +1.5% minimum safety margin
      if (tpPrice <= currentMarketPrice || tpPrice < minTpPrice) {
        const adjustedTp = formatPrice(minTpPrice);
        console.warn(`   ⚠️ TP ${tpPrice} too close/below current ${currentMarketPrice} for LONG`);
        console.warn(`   → Adjusting to ${adjustedTp} (+1.5% safety margin)`);
        await logToBot('warning', 'tp_adjusted_long', `LONG: TP adjusted from ${tpPrice} to ${adjustedTp}`, { 
          original: originalTp, 
          adjusted: adjustedTp, 
          market: currentMarketPrice,
          reason: 'too_close_to_market'
        }, alertId);
        tpPrice = adjustedTp;
      }
      
      // SL must be BELOW current price with 1.5% safety margin
      const maxSlPrice = currentMarketPrice * 0.985; // -1.5% maximum safety margin
      if (slPrice >= currentMarketPrice || slPrice > maxSlPrice) {
        const adjustedSl = formatPrice(maxSlPrice);
        console.warn(`   ⚠️ SL ${slPrice} too close/above current ${currentMarketPrice} for LONG`);
        console.warn(`   → Adjusting to ${adjustedSl} (-1.5% safety margin)`);
        await logToBot('warning', 'sl_adjusted_long', `LONG: SL adjusted from ${slPrice} to ${adjustedSl}`, { 
          original: originalSl, 
          adjusted: adjustedSl, 
          market: currentMarketPrice,
          reason: 'too_close_to_market'
        }, alertId);
        slPrice = adjustedSl;
      }
      
      console.log(`   ✅ LONG validated - TP: ${tpPrice} (above), SL: ${slPrice} (below)`);
    } else {
      // ========================================
      // ✅ CRITICAL FIX: SELL/SHORT positions
      // SHORT: TP BELOW entry, SL ABOVE entry
      // ========================================
      console.log(`   📉 SHORT position validation...`);
      
      // TP must be BELOW current price with 1.5% safety margin
      const maxTpPrice = currentMarketPrice * 0.985; // -1.5% (TP below market for SHORT)
      if (tpPrice >= currentMarketPrice || tpPrice > maxTpPrice) {
        const adjustedTp = formatPrice(maxTpPrice);
        console.warn(`   ⚠️ TP ${tpPrice} too high/equal for SHORT (must be below ${maxTpPrice})`);
        console.warn(`   → Adjusting to ${adjustedTp} (-1.5% safety margin)`);
        await logToBot('warning', 'tp_adjusted_short', `SHORT: TP adjusted from ${tpPrice} to ${adjustedTp}`, { 
          original: originalTp, 
          adjusted: adjustedTp, 
          market: currentMarketPrice,
          reason: 'too_close_to_market'
        }, alertId);
        tpPrice = adjustedTp;
      }
      
      // SL must be ABOVE current price with 1.5% safety margin
      const minSlPrice = currentMarketPrice * 1.015; // +1.5% (SL above market for SHORT)
      if (slPrice <= currentMarketPrice || slPrice < minSlPrice) {
        const adjustedSl = formatPrice(minSlPrice);
        console.warn(`   ⚠️ SL ${slPrice} too low/equal for SHORT (must be above ${minSlPrice})`);
        console.warn(`   → Adjusting to ${adjustedSl} (+1.5% safety margin)`);
        await logToBot('warning', 'sl_adjusted_short', `SHORT: SL adjusted from ${slPrice} to ${adjustedSl}`, { 
          original: originalSl, 
          adjusted: adjustedSl, 
          market: currentMarketPrice,
          reason: 'too_close_to_market'
        }, alertId);
        slPrice = adjustedSl;
      }
      
      console.log(`   ✅ SHORT validated - TP: ${tpPrice} (below), SL: ${slPrice} (above)`);
    }
    
    console.log(`\n   ✅ Final validated prices:`);
    console.log(`      Direction: ${isBuy ? 'LONG' : 'SHORT'}`);
    console.log(`      Market: ${currentMarketPrice}`);
    console.log(`      TP: ${tpPrice} ${isBuy ? '(+above)' : '(-below)'}`);
    console.log(`      SL: ${slPrice} ${isBuy ? '(-below)' : '(+above)'}`);
  }

  // ============================================
  // 📈 STEP 7: PLACE ORDER WITHOUT SL/TP (SET THEM AFTER)
  // ============================================
  console.log(`\n📈 Placing market order WITHOUT SL/TP (will set after execution)...`);
  
  const formatPrice = (price: number) => {
    const decimals = tickSz.toString().includes('.') 
      ? tickSz.toString().split('.')[1].length 
      : 0;
    return price.toFixed(decimals);
  };
  
  const orderPayload: any = {
    instId: okxSymbol,
    tdMode: 'cross',
    side: side.toLowerCase(),
    ordType: 'market',
    sz: quantity, // Already properly formatted string
  };

  // ✅ CRITICAL FIX: DO NOT attach SL/TP to initial order
  // OKX rejects them because market order executes at different price
  // We will set SL/TP as separate algo orders AFTER position opens

  console.log(`\n📤 ORDER PAYLOAD (NO SL/TP):`);
  console.log(JSON.stringify(orderPayload, null, 2));

  const { data: orderData } = await makeOkxRequest(
    'POST',
    '/api/v5/trade/order',
    apiKey,
    apiSecret,
    passphrase,
    demo,
    orderPayload,
    alertId
  );

  console.log(`\n📥 ORDER RESPONSE:`);
  console.log(JSON.stringify(orderData, null, 2));

  if (orderData.code !== '0') {
    const errorMsg = `OKX order failed (code ${orderData.code}): ${orderData.msg}`;
    console.error(`❌ ${errorMsg}`);
    
    await logToBot('error', 'order_failed', errorMsg, {
      code: orderData.code,
      msg: orderData.msg,
      data: orderData.data,
      orderPayload,
      demo
    }, alertId);
    
    throw new Error(errorMsg);
  }

  const orderId = orderData.data?.[0]?.ordId || 'unknown';
  
  console.log(`\n✅ Position opened successfully (Order ID: ${orderId})`);
  console.log(`⏳ Waiting for position to settle before setting SL/TP...`);
  
  // ✅ Wait 2 seconds for position to settle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // ============================================
  // 🔍 GET ACTUAL EXECUTION PRICE FROM EXCHANGE
  // ============================================
  console.log(`\n🔍 Fetching actual execution price from OKX...`);
  let actualEntryPrice: number = entryPrice; // fallback
  let actualPositionQty: number = finalContracts; // fallback
  
  try {
    const { data: posData } = await makeOkxRequest(
      'GET',
      `/api/v5/account/positions?instType=SWAP&instId=${okxSymbol}`,
      apiKey,
      apiSecret,
      passphrase,
      demo,
      undefined,
      alertId
    );
    
    if (posData.code === '0' && posData.data && posData.data.length > 0) {
      const position = posData.data.find((p: any) => 
        p.instId === okxSymbol && parseFloat(p.pos) !== 0
      );
      
      if (position) {
        actualEntryPrice = parseFloat(position.avgPx);
        actualPositionQty = Math.abs(parseFloat(position.pos));
        console.log(`✅ Actual entry from OKX: ${actualEntryPrice}`);
        console.log(`✅ Actual quantity from OKX: ${actualPositionQty}`);
        
        await logToBot('info', 'actual_entry_retrieved', `Actual entry price: ${actualEntryPrice} (planned: ${entryPrice})`, {
          actualEntry: actualEntryPrice,
          plannedEntry: entryPrice,
          difference: Math.abs(actualEntryPrice - entryPrice),
          differencePercent: ((Math.abs(actualEntryPrice - entryPrice) / entryPrice) * 100).toFixed(2)
        }, alertId);
      } else {
        console.warn(`⚠️ Position not found immediately after opening, using planned values`);
      }
    }
  } catch (error: any) {
    console.error(`❌ Failed to get actual entry price:`, error.message);
    await logToBot('warning', 'actual_entry_failed', `Could not get actual entry, using planned: ${error.message}`, {
      error: error.message
    }, alertId);
  }
  
  // ============================================
  // 🔧 RECALCULATE SL/TP BASED ON ACTUAL ENTRY
  // ============================================
  console.log(`\n🔧 Recalculating SL/TP based on actual entry price...`);
  
  if (slPrice && tpPrice) {
    const isBuy = side.toUpperCase() === "BUY";
    
    // Calculate original SL and TP distances from planned entry
    const originalSlDistance = Math.abs(entryPrice - slPrice);
    const originalTpDistance = Math.abs(entryPrice - (tpPrice || entryPrice));
    
    console.log(`   Original distances: SL ${originalSlDistance.toFixed(4)}, TP ${originalTpDistance.toFixed(4)}`);
    
    // Apply same distances to actual entry
    if (isBuy) {
      slPrice = actualEntryPrice - originalSlDistance;
      tpPrice = actualEntryPrice + originalTpDistance;
    } else {
      slPrice = actualEntryPrice + originalSlDistance;
      tpPrice = actualEntryPrice - originalTpDistance;
    }
    
    // Apply safety margin (1.5%) to ensure OKX accepts them
    const slSafetyMargin = actualEntryPrice * 0.015; // 1.5%
    const tpSafetyMargin = actualEntryPrice * 0.015;
    
    if (isBuy) {
      // LONG: SL below, TP above
      const minSlPrice = actualEntryPrice - slSafetyMargin;
      if (slPrice > minSlPrice) {
        console.warn(`   ⚠️ SL ${slPrice.toFixed(4)} too close, adjusting to ${minSlPrice.toFixed(4)}`);
        slPrice = minSlPrice;
      }
      
      const minTpPrice = actualEntryPrice + tpSafetyMargin;
      if (tpPrice < minTpPrice) {
        console.warn(`   ⚠️ TP ${tpPrice.toFixed(4)} too close, adjusting to ${minTpPrice.toFixed(4)}`);
        tpPrice = minTpPrice;
      }
    } else {
      // SHORT: SL above, TP below
      const maxSlPrice = actualEntryPrice + slSafetyMargin;
      if (slPrice < maxSlPrice) {
        console.warn(`   ⚠️ SL ${slPrice.toFixed(4)} too close, adjusting to ${maxSlPrice.toFixed(4)}`);
        slPrice = maxSlPrice;
      }
      
      const maxTpPrice = actualEntryPrice - tpSafetyMargin;
      if (tpPrice > maxTpPrice) {
        console.warn(`   ⚠️ TP ${tpPrice.toFixed(4)} too close, adjusting to ${maxTpPrice.toFixed(4)}`);
        tpPrice = maxTpPrice;
      }
    }
    
    console.log(`   ✅ Recalculated SL/TP:`);
    console.log(`      Entry: ${actualEntryPrice.toFixed(4)}`);
    console.log(`      SL: ${slPrice.toFixed(4)} (distance: ${Math.abs(actualEntryPrice - slPrice).toFixed(4)})`);
    console.log(`      TP: ${tpPrice.toFixed(4)} (distance: ${Math.abs(actualEntryPrice - (tpPrice || actualEntryPrice)).toFixed(4)})`);
    
    await logToBot('info', 'sl_tp_recalculated', `SL/TP recalculated based on actual entry ${actualEntryPrice}`, {
      actualEntry: actualEntryPrice,
      slPrice,
      tpPrice,
      slDistance: Math.abs(actualEntryPrice - slPrice),
      tpDistance: Math.abs(actualEntryPrice - (tpPrice || actualEntryPrice))
    }, alertId);
    
    // ============================================
    // 🎯 SET SL/TP AS SEPARATE ALGO ORDERS
    // ============================================
    console.log(`\n🎯 Setting SL/TP as separate algo orders...`);
    
    try {
      const algoPayload: any = {
        instId: okxSymbol,
        tdMode: 'cross',
        side: isBuy ? 'sell' : 'buy',
        ordType: 'conditional',
        sz: actualPositionQty.toString(),
      };
      
      if (tpPrice) {
        algoPayload.tpTriggerPx = formatPrice(tpPrice);
        algoPayload.tpOrdPx = '-1';
        console.log(`   🎯 TP: ${algoPayload.tpTriggerPx}`);
      }
      
      if (slPrice) {
        algoPayload.slTriggerPx = formatPrice(slPrice);
        algoPayload.slOrdPx = '-1';
        console.log(`   🛑 SL: ${algoPayload.slTriggerPx}`);
      }
      
      console.log(`\n📤 Algo Order Payload:`);
      console.log(JSON.stringify(algoPayload, null, 2));
      
      const { data: algoData } = await makeOkxRequest(
        'POST',
        '/api/v5/trade/order-algo',
        apiKey,
        apiSecret,
        passphrase,
        demo,
        algoPayload,
        alertId
      );
      
      console.log(`\n📥 Algo Order Response:`);
      console.log(JSON.stringify(algoData, null, 2));
      
      if (algoData.code === '0') {
        const algoId = algoData.data?.[0]?.algoId || 'unknown';
        console.log(`✅ SL/TP algo order set successfully: ${algoId}`);
        await logToBot('success', 'sl_tp_set', `SL/TP set as algo order: ${algoId}`, {
          algoId,
          slPrice,
          tpPrice
        }, alertId);
        
        // ✅ CRITICAL FIX: Wait for algo orders to propagate in OKX system
        console.log(`\n⏳ Waiting 5 seconds for algo orders to propagate...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log(`✅ Wait complete - algo orders should be visible now`);
      } else {
        console.error(`❌ Failed to set SL/TP algo order: ${algoData.msg}`);
        await logToBot('error', 'sl_tp_failed', `Failed to set SL/TP: ${algoData.msg}`, {
          code: algoData.code,
          msg: algoData.msg,
          algoPayload
        }, alertId);
      }
    } catch (algoError: any) {
      console.error(`❌ Error setting SL/TP algo order:`, algoError.message);
      await logToBot('error', 'sl_tp_error', `Error setting SL/TP: ${algoError.message}`, {
        error: algoError.message
      }, alertId);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ POSITION OPENED SUCCESSFULLY`);
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Symbol: ${okxSymbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Quantity: ${quantity} contracts`);
  console.log(`   Actual Entry: ${actualEntryPrice}`);
  console.log(`   SL: ${slPrice?.toFixed(4) || 'N/A'}`);
  console.log(`   TP: ${tpPrice?.toFixed(4) || 'N/A'}`);
  console.log(`${'='.repeat(60)}\n`);

  await logToBot('success', 'position_opened', `OKX position opened: ${okxSymbol} ${side} ${leverage}x`, { 
    orderId, 
    symbol: okxSymbol, 
    side, 
    leverage, 
    quantity: finalContracts,
    positionSizeUsd,
    actualEntry: actualEntryPrice,
    sl: slPrice, 
    tp: tpPrice
  }, alertId);

  return { orderId, quantity: finalContracts, okxSymbol, actualEntryPrice };
}

// ============================================
// 🔄 OKX POSITION CLOSING
// ============================================

async function closeOkxPosition(
  symbol: string,
  positionSide: string,
  quantity: number,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  alertId?: number,
  positionId?: number
) {
  console.log(`🔄 Closing OKX position: ${symbol} ${positionSide} qty=${quantity}`);

  const orderPayload = {
    instId: symbol,
    tdMode: 'cross',
    side: positionSide === 'BUY' ? 'sell' : 'buy',
    ordType: 'market',
    sz: quantity.toString(),
  };

  const { data } = await makeOkxRequest(
    'POST',
    '/api/v5/trade/order',
    apiKey,
    apiSecret,
    passphrase,
    demo,
    orderPayload,
    alertId
  );

  if (data.code !== '0') {
    throw new Error(`OKX close failed (code ${data.code}): ${data.msg}`);
  }

  const orderId = data.data?.[0]?.ordId || 'unknown';
  console.log('✅ OKX position closed:', orderId);

  await logToBot('success', 'position_closed', `OKX position closed: ${symbol}`, { orderId, symbol }, alertId, positionId);

  return orderId;
}

// ============================================
// 🎯 ADD ADDITIONAL TP LEVELS (TP2, TP3)
// ============================================

async function addAdditionalTakeProfit(
  symbol: string,
  side: string,
  tpPrice: number,
  quantity: number,
  tickSz: number,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  alertId?: number
) {
  console.log(`\n🎯 Adding additional TP: ${tpPrice} for ${symbol} ${side}`);

  const formatPrice = (price: number) => {
    const decimals = tickSz.toString().includes('.') 
      ? tickSz.toString().split('.')[1].length 
      : 0;
    return price.toFixed(decimals);
  };

  // Create conditional TP order
  const algoPayload = {
    instId: symbol,
    tdMode: 'cross',
    side: side === 'BUY' ? 'sell' : 'buy',
    ordType: 'conditional',
    sz: quantity.toString(),
    tpTriggerPx: formatPrice(tpPrice),
    tpOrdPx: '-1', // Market price when triggered
  };

  console.log(`📤 Algo Order Payload:`, JSON.stringify(algoPayload, null, 2));

  const { data } = await makeOkxRequest(
    'POST',
    '/api/v5/trade/order-algo',
    apiKey,
    apiSecret,
    passphrase,
    demo,
    algoPayload,
    alertId
  );

  if (data.code !== '0') {
    console.error(`❌ Failed to add TP ${tpPrice}:`, data.msg);
    await logToBot('warning', 'additional_tp_failed', `Failed to add TP ${tpPrice}: ${data.msg}`, { 
      data, 
      algoPayload 
    }, alertId);
    return null;
  }

  const algoId = data.data?.[0]?.algoId || 'unknown';
  console.log(`✅ Additional TP added: ${algoId}`);
  await logToBot('success', 'additional_tp_added', `TP ${tpPrice} added for ${symbol}`, { 
    algoId, 
    tpPrice 
  }, alertId);

  return algoId;
}

// ============================================
// 🔍 VERIFY POSITION OPENING (NEW: ZADANIE 7)
// ============================================

interface VerificationResult {
  success: boolean;
  discrepancies: Array<{
    field: string;
    planned: number | string;
    actual: number | string;
    diff: number;
    threshold: number;
  }>;
}

async function verifyPositionOpening(
  positionId: number,
  planned: {
    symbol: string;
    side: string;
    quantity: number;
    entryPrice: number;
    slPrice: number | null;
    tp1Price: number | null;
    tp2Price: number | null;
    tp3Price: number | null;
    leverage: number;
  },
  orderId: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  alertId: number,
  botSettings: any
): Promise<VerificationResult> {
  console.log(`\n🔍 ========== POSITION VERIFICATION START ==========`);
  console.log(`   Position ID: ${positionId}`);
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Symbol: ${planned.symbol}`);
  console.log(`   Environment: ${demo ? 'DEMO' : 'PRODUCTION'}`);
  
  const discrepancies: VerificationResult['discrepancies'] = [];
  const PRICE_TOLERANCE = 0.005; // 0.5%
  const QUANTITY_TOLERANCE = 0.01; // 1%
  
  // ✅ NEW: Increase retry for Demo environment
  const MAX_RETRIES = demo ? 5 : 2; // Demo: 5 tries, Prod: 2 tries
  const WAIT_TIME = demo ? 3000 : 2000; // Demo: 3s, Prod: 2s
  
  console.log(`   Retry config: MAX_RETRIES=${MAX_RETRIES}, WAIT_TIME=${WAIT_TIME}ms`);
  console.log(`   Total max wait: ${(MAX_RETRIES + 1) * WAIT_TIME / 1000}s`);
  
  try {
    // ============================================
    // STEP 1: Get actual position from exchange
    // ============================================
    console.log(`\n📊 Fetching actual position from OKX...`);
    const { data: posData } = await makeOkxRequest(
      'GET',
      `/api/v5/account/positions?instType=SWAP&instId=${planned.symbol}`,
      apiKey,
      apiSecret,
      passphrase,
      demo,
      undefined,
      alertId
    );
    
    if (posData.code !== '0' || !posData.data || posData.data.length === 0) {
      console.error(`   ❌ Position not found on exchange`);
      throw new Error(`Position not found on exchange after opening`);
    }
    
    const actualPosition = posData.data.find((p: any) => 
      p.instId === planned.symbol && parseFloat(p.pos) !== 0
    );
    
    if (!actualPosition) {
      console.error(`   ❌ No matching position found for ${planned.symbol}`);
      throw new Error(`No matching position found for ${planned.symbol}`);
    }
    
    console.log(`   ✅ Position found on exchange`);
    
    // ============================================
    // STEP 2: Get algo orders (SL/TP) WITH RETRY
    // ============================================
    console.log(`\n📋 Fetching algo orders (SL/TP)...`);
    
    let algoOrders: any[] = [];
    let retryCount = 0;
    
    // ✅ FIX: Try to get algo orders with retry mechanism
    while (retryCount <= MAX_RETRIES) {
      const { data: algoData } = await makeOkxRequest(
        'GET',
        `/api/v5/trade/orders-algo-pending?instType=SWAP&instId=${planned.symbol}`,
        apiKey,
        apiSecret,
        passphrase,
        demo,
        undefined,
        alertId
      );
      
      algoOrders = algoData.code === '0' && algoData.data ? algoData.data : [];
      console.log(`   📊 Attempt ${retryCount + 1}/${MAX_RETRIES + 1}: Found ${algoOrders.length} algo orders`);
      
      // Find SL and TP orders
      const slOrder = algoOrders.find((o: any) => o.slTriggerPx && parseFloat(o.slTriggerPx) > 0);
      const tp1Order = algoOrders.find((o: any) => o.tpTriggerPx && parseFloat(o.tpTriggerPx) > 0);
      
      const hasExpectedSL = !planned.slPrice || !!slOrder;
      const hasExpectedTP = !planned.tp1Price || !!tp1Order;
      
      // If we found all expected orders, break
      if (hasExpectedSL && hasExpectedTP) {
        console.log(`   ✅ All expected algo orders found`);
        break;
      }
      
      // If missing and can retry, wait and try again
      if (retryCount < MAX_RETRIES) {
        console.log(`   ⚠️ SL/TP not found yet, waiting ${WAIT_TIME}ms before retry...`);
        console.log(`      Expected SL: ${planned.slPrice ? 'YES' : 'NO'}, Found: ${slOrder ? 'YES' : 'NO'}`);
        console.log(`      Expected TP1: ${planned.tp1Price ? 'YES' : 'NO'}, Found: ${tp1Order ? 'YES' : 'NO'}`);
        
        if (demo) {
          console.log(`      🐌 Demo environment detected - allowing extra time for order propagation`);
        }
        
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME));
        retryCount++;
      } else {
        console.log(`   ⚠️ Max retries (${MAX_RETRIES}) reached, proceeding with verification...`);
        if (demo) {
          console.log(`      ⚠️ Demo environment may need more time for SL/TP propagation`);
        }
        break;
      }
    }
    
    console.log(`   ✅ Final algo orders count: ${algoOrders.length} (after ${retryCount} retries)`);
    
    // ============================================
    // STEP 3: Extract actual values
    // ============================================
    const actualQuantity = Math.abs(parseFloat(actualPosition.pos));
    const actualEntryPrice = parseFloat(actualPosition.avgPx);
    const actualLeverage = parseInt(actualPosition.lever);
    
    // Find SL and TP orders
    const slOrder = algoOrders.find((o: any) => o.slTriggerPx && parseFloat(o.slTriggerPx) > 0);
    const tp1Order = algoOrders.find((o: any) => o.tpTriggerPx && parseFloat(o.tpTriggerPx) > 0);
    
    const actualSlPrice = slOrder ? parseFloat(slOrder.slTriggerPx) : null;
    const actualTp1Price = tp1Order ? parseFloat(tp1Order.tpTriggerPx) : null;
    
    console.log(`\n📊 Actual values from exchange:`);
    console.log(`   Quantity: ${actualQuantity}`);
    console.log(`   Entry: ${actualEntryPrice}`);
    console.log(`   Leverage: ${actualLeverage}x`);
    console.log(`   SL: ${actualSlPrice || 'NOT FOUND'}`);
    console.log(`   TP1: ${actualTp1Price || 'NOT FOUND'}`);
    console.log(`   Total wait time used: ${retryCount * WAIT_TIME / 1000}s`);
    
    // ============================================
    // STEP 4: Compare with tolerances
    // ============================================
    console.log(`\n🔍 Comparing planned vs actual...`);
    
    // Quantity check
    const quantityDiff = Math.abs(actualQuantity - planned.quantity);
    const quantityDiffPercent = quantityDiff / planned.quantity;
    console.log(`   Quantity: planned ${planned.quantity}, actual ${actualQuantity}, diff ${(quantityDiffPercent * 100).toFixed(2)}%`);
    
    if (quantityDiffPercent > QUANTITY_TOLERANCE) {
      discrepancies.push({
        field: 'quantity',
        planned: planned.quantity,
        actual: actualQuantity,
        diff: quantityDiff,
        threshold: QUANTITY_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: ${(quantityDiffPercent * 100).toFixed(2)}% > ${(QUANTITY_TOLERANCE * 100).toFixed(2)}%`);
    } else {
      console.log(`      ✅ OK`);
    }
    
    // Entry price check
    const entryDiff = Math.abs(actualEntryPrice - planned.entryPrice);
    const entryDiffPercent = entryDiff / planned.entryPrice;
    console.log(`   Entry: planned ${planned.entryPrice}, actual ${actualEntryPrice}, diff ${(entryDiffPercent * 100).toFixed(2)}%`);
    
    if (entryDiffPercent > PRICE_TOLERANCE) {
      discrepancies.push({
        field: 'entryPrice',
        planned: planned.entryPrice,
        actual: actualEntryPrice,
        diff: entryDiff,
        threshold: PRICE_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: ${(entryDiffPercent * 100).toFixed(2)}% > ${(PRICE_TOLERANCE * 100).toFixed(2)}%`);
    } else {
      console.log(`      ✅ OK`);
    }
    
    // SL check
    if (planned.slPrice && actualSlPrice) {
      const slDiff = Math.abs(actualSlPrice - planned.slPrice);
      const slDiffPercent = slDiff / planned.slPrice;
      console.log(`   SL: planned ${planned.slPrice.toFixed(4)}, actual ${actualSlPrice.toFixed(4)}, diff ${(slDiffPercent * 100).toFixed(2)}%`);
      
      if (slDiffPercent > PRICE_TOLERANCE) {
        discrepancies.push({
          field: 'slPrice',
          planned: planned.slPrice,
          actual: actualSlPrice,
          diff: slDiff,
          threshold: PRICE_TOLERANCE
        });
        console.log(`      ⚠️ DISCREPANCY: ${(slDiffPercent * 100).toFixed(2)}% > ${(PRICE_TOLERANCE * 100).toFixed(2)}%`);
      } else {
        console.log(`      ✅ OK`);
      }
    } else if (planned.slPrice && !actualSlPrice) {
      discrepancies.push({
        field: 'slPrice',
        planned: planned.slPrice,
        actual: 'MISSING',
        diff: 0,
        threshold: PRICE_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: SL not found on exchange (after ${retryCount} retries, ${retryCount * WAIT_TIME / 1000}s wait)`);
      if (demo) {
        console.log(`      ⚠️ Demo environment: Consider manual verification or longer wait times`);
      }
    }
    
    // TP1 check
    if (planned.tp1Price && actualTp1Price) {
      const tp1Diff = Math.abs(actualTp1Price - planned.tp1Price);
      const tp1DiffPercent = tp1Diff / planned.tp1Price;
      console.log(`   TP1: planned ${planned.tp1Price.toFixed(4)}, actual ${actualTp1Price.toFixed(4)}, diff ${(tp1DiffPercent * 100).toFixed(2)}%`);
      
      if (tp1DiffPercent > PRICE_TOLERANCE) {
        discrepancies.push({
          field: 'tp1Price',
          planned: planned.tp1Price,
          actual: actualTp1Price,
          diff: tp1Diff,
          threshold: PRICE_TOLERANCE
        });
        console.log(`      ⚠️ DISCREPANCY: ${(tp1DiffPercent * 100).toFixed(2)}% > ${(PRICE_TOLERANCE * 100).toFixed(2)}%`);
      } else {
        console.log(`      ✅ OK`);
      }
    } else if (planned.tp1Price && !actualTp1Price) {
      discrepancies.push({
        field: 'tp1Price',
        planned: planned.tp1Price,
        actual: 'MISSING',
        diff: 0,
        threshold: PRICE_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: TP1 not found on exchange (after ${retryCount} retries, ${retryCount * WAIT_TIME / 1000}s wait)`);
      if (demo) {
        console.log(`      ⚠️ Demo environment: Consider manual verification or longer wait times`);
      }
    }
    
    // ============================================
    // STEP 5: Log to bot_detailed_logs
    // ============================================
    console.log(`\n📝 Logging verification to bot_detailed_logs...`);
    
    await db.insert(botDetailedLogs).values({
      positionId,
      alertId,
      actionType: 'open_position',
      stage: 'verification',
      plannedSymbol: planned.symbol,
      plannedSide: planned.side,
      plannedQuantity: planned.quantity,
      plannedEntryPrice: planned.entryPrice,
      plannedSlPrice: planned.slPrice,
      plannedTp1Price: planned.tp1Price,
      plannedTp2Price: planned.tp2Price,
      plannedTp3Price: planned.tp3Price,
      plannedLeverage: planned.leverage,
      actualSymbol: actualPosition.instId,
      actualSide: parseFloat(actualPosition.pos) > 0 ? 'BUY' : 'SELL',
      actualQuantity,
      actualEntryPrice,
      actualSlPrice,
      actualTp1Price,
      actualTp2Price: null,
      actualTp3Price: null,
      actualLeverage,
      hasDiscrepancy: discrepancies.length > 0,
      discrepancyDetails: discrepancies.length > 0 ? JSON.stringify(discrepancies) : null,
      discrepancyThreshold: PRICE_TOLERANCE,
      settingsSnapshot: JSON.stringify(botSettings),
      orderId,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    
    console.log(`   ✅ Verification logged to database`);
    
    // ============================================
    // STEP 6: Return result
    // ============================================
    const success = discrepancies.length === 0;
    
    console.log(`\n🔍 ========== VERIFICATION ${success ? 'PASSED ✅' : 'FAILED ❌'} ==========`);
    if (!success) {
      console.log(`   Discrepancies found: ${discrepancies.length}`);
      discrepancies.forEach(d => {
        console.log(`   - ${d.field}: planned ${d.planned}, actual ${d.actual}`);
      });
    }
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success,
      discrepancies
    };
    
  } catch (error: any) {
    console.error(`\n❌ Verification failed with error:`, error.message);
    
    // Log error verification
    await db.insert(botDetailedLogs).values({
      positionId,
      alertId,
      actionType: 'open_position',
      stage: 'verification_error',
      plannedSymbol: planned.symbol,
      plannedSide: planned.side,
      plannedQuantity: planned.quantity,
      plannedEntryPrice: planned.entryPrice,
      plannedSlPrice: planned.slPrice,
      plannedTp1Price: planned.tp1Price,
      plannedTp2Price: planned.tp2Price,
      plannedTp3Price: planned.tp3Price,
      plannedLeverage: planned.leverage,
      actualSymbol: null,
      actualSide: null,
      actualQuantity: null,
      actualEntryPrice: null,
      actualSlPrice: null,
      actualTp1Price: null,
      actualTp2Price: null,
      actualTp3Price: null,
      actualLeverage: null,
      hasDiscrepancy: true,
      discrepancyDetails: JSON.stringify({ error: error.message }),
      discrepancyThreshold: PRICE_TOLERANCE,
      settingsSnapshot: JSON.stringify(botSettings),
      orderId,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    
    // Return as failed verification
    return {
      success: false,
      discrepancies: [{
        field: 'verification_error',
        planned: 'N/A',
        actual: error.message,
        diff: 0,
        threshold: 0
      }]
    };
  }
}

// ============================================
// 🌐 GET ENDPOINT (TEST)
// ============================================

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  
  await logToBot('info', 'webhook_test', 'Webhook endpoint tested via GET', { timestamp, url: request.url });
  
  return NextResponse.json({ 
    status: 'online',
    message: 'TradingView Webhook Endpoint (OKX ONLY) is working!',
    timestamp,
    endpoint: '/api/webhook/tradingview',
    exchange: 'OKX',
    methods: ['GET (test)', 'POST (receive alerts)']
  });
}

// ============================================
// 📨 POST ENDPOINT (RECEIVE ALERTS)
// ============================================

export async function POST(request: Request) {
  let trackingId: number | null = null;
  
  try {
    // Parse request body
    const rawBody = await request.text();
    console.log("📨 RAW WEBHOOK BODY:", rawBody);
    
    let rawData;
    try {
      rawData = JSON.parse(rawBody);
    } catch (parseError) {
      await logToBot('error', 'parse_error', 'Failed to parse JSON', { error: String(parseError), rawBodyPreview: rawBody.substring(0, 500) });
      return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
    }

    const data = snakeToCamel(rawData);
    console.log("🔄 Normalized alert data:", JSON.stringify(data, null, 2));

    // ✅ CRITICAL FIX: Validate symbol exists BEFORE normalization
    if (!data.symbol || (typeof data.symbol === 'string' && data.symbol.trim() === '')) {
      await logToBot('error', 'validation_failed', 'Symbol is missing or empty', { receivedData: data });
      return NextResponse.json({ 
        error: 'Symbol is required and cannot be empty. Check your TradingView alert JSON - make sure "symbol": "{{ticker}}" is included.',
        receivedData: data
      }, { status: 400 });
    }

    // ✅ IMPROVED: Safe symbol normalization
    const originalSymbol = data.symbol.trim();
    const normalizedSymbol = originalSymbol.replace(/\.P$/, '');
    
    // ✅ CRITICAL: If normalization resulted in empty string, use original
    data.symbol = normalizedSymbol || originalSymbol;
    
    console.log(`🔧 Symbol: ${originalSymbol} → ${data.symbol}`);

    // ✅ Validate symbol format
    if (!/^[A-Z0-9]+(-[A-Z]+)?$/i.test(data.symbol)) {
      await logToBot('error', 'validation_failed', `Invalid symbol format: ${data.symbol}`, { symbol: data.symbol, originalSymbol });
      return NextResponse.json({ 
        error: `Invalid symbol format: "${data.symbol}". Expected format: BTCUSDT or BTC-USDT`,
        symbol: data.symbol,
        originalSymbol
      }, { status: 400 });
    }

    // ✅ Validate other required fields (symbol already validated above)
    const requiredFields = ["side", "tier", "entryPrice"];
    for (const field of requiredFields) {
      if (!(field in data) || !data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        await logToBot('error', 'validation_failed', `Missing or empty field: ${field}`, { field, data });
        return NextResponse.json({ 
          error: `Missing or empty required field: ${field}. Check your TradingView alert JSON configuration.`,
          field,
          receivedData: data
        }, { status: 400 });
      }
    }

    const receivedAt = Date.now();
    const alertTimestamp = data.timestamp || data.tvTs || Math.floor(receivedAt / 1000);
    const latency = Math.max(0, receivedAt - (alertTimestamp * 1000));

    const duplicateCheck = await db.select()
      .from(alerts)
      .where(and(
        eq(alerts.symbol, data.symbol),
        eq(alerts.side, data.side),
        eq(alerts.tier, data.tier)
      ))
      .limit(10);
    
    const isDuplicate = duplicateCheck.some(alert => Math.abs(alert.timestamp - alertTimestamp) < 5);
    
    if (isDuplicate) {
      console.log("⚠️ Duplicate alert ignored");
      await logToBot('warning', 'duplicate_ignored', `Duplicate: ${data.symbol} ${data.side}`, { symbol: data.symbol, side: data.side });
      return NextResponse.json({ success: true, message: "Duplicate alert ignored", duplicate: true });
    }

    const [alert] = await db.insert(alerts).values({
      timestamp: alertTimestamp,
      symbol: data.symbol,
      side: data.side,
      tier: data.tier,
      tierNumeric: data.tierNumeric || 3,
      strength: data.strength || 0.5,
      entryPrice: parseFloat(data.entryPrice),
      sl: parseFloat(data.sl || "0"),
      tp1: parseFloat(data.tp1 || "0"),
      tp2: parseFloat(data.tp2 || "0"),
      tp3: parseFloat(data.tp3 || "0"),
      mainTp: parseFloat(data.mainTp || data.tp1 || "0"),
      atr: data.atr || 0,
      volumeRatio: data.volumeRatio || 1,
      session: data.session || "unknown",
      regime: data.regime || "neutral",
      regimeConfidence: data.regimeConfidence || 0.5,
      mtfAgreement: data.mtfAgreement || 0.5,
      leverage: data.leverage || 10,
      inOb: data.inOb || false,
      inFvg: data.inFvg || false,
      obScore: data.obScore || 0,
      fvgScore: data.fvgScore || 0,
      institutionalFlow: data.institutionalFlow || null,
      accumulation: data.accumulation || null,
      volumeClimax: data.volumeClimax || null,
      latency,
      rawJson: JSON.stringify(data),
      executionStatus: 'pending',
      rejectionReason: null,
      errorType: null,
      createdAt: new Date().toISOString(),
    }).returning();

    console.log("✅ Alert saved:", alert.id);
    await logToBot('info', 'alert_received', `Alert received: ${data.symbol} ${data.side} ${data.tier}`, { symbol: data.symbol, side: data.side, tier: data.tier }, alert.id);

    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) {
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'no_bot_settings',
        errorType: 'configuration_missing'
      }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'Bot settings not configured', { reason: 'no_bot_settings' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, bot settings missing" });
    }

    const botConfig = settings[0];

    if (!botConfig.apiKey || !botConfig.apiSecret || !botConfig.passphrase) {
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'no_api_credentials',
        errorType: 'configuration_missing'
      }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'OKX API credentials incomplete', { reason: 'no_api_credentials' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, OKX credentials incomplete" });
    }

    // ============================================
    // 🔍 NEW: LOG BOT SETTINGS VERIFICATION (ZADANIE 8)
    // ============================================
    console.log(`\n📋 ========== BOT SETTINGS VERIFICATION ==========`);
    console.log(`✅ Using bot settings from DATABASE (not hardcoded):`);
    console.log(`   Bot Enabled: ${botConfig.botEnabled}`);
    console.log(`   Exchange: ${botConfig.exchange}`);
    console.log(`   Environment: ${botConfig.environment}`);
    console.log(`   Position Size: $${botConfig.positionSizeFixed}`);
    console.log(`   Leverage Mode: ${botConfig.leverageMode}`);
    console.log(`   Leverage Fixed: ${botConfig.leverageFixed}x`);
    console.log(`   Use Default SL/TP: ${botConfig.useDefaultSlTp}`);
    console.log(`   SL as Margin %: ${botConfig.slAsMarginPercent}`);
    console.log(`   SL Margin Risk %: ${botConfig.slMarginRiskPercent}%`);
    console.log(`   TP Count: ${botConfig.tpCount}`);
    console.log(`   TP1 R:R: ${botConfig.tp1RR}`);
    console.log(`   TP2 R:R: ${botConfig.tp2RR}`);
    console.log(`   TP3 R:R: ${botConfig.tp3RR}`);
    console.log(`   Adaptive R:R: ${botConfig.adaptiveRR}`);
    console.log(`   Disabled Tiers: ${botConfig.disabledTiers}`);
    console.log(`${'='.repeat(50)}\n`);
    
    await logToBot('info', 'settings_loaded', `Bot settings loaded from DB - Position: $${botConfig.positionSizeFixed}, Leverage: ${botConfig.leverageFixed}x, SL as margin: ${botConfig.slAsMarginPercent}, TP count: ${botConfig.tpCount}`, {
      botEnabled: botConfig.botEnabled,
      positionSize: botConfig.positionSizeFixed,
      leverage: botConfig.leverageFixed,
      slAsMarginPercent: botConfig.slAsMarginPercent,
      slMarginRiskPercent: botConfig.slMarginRiskPercent,
      tpCount: botConfig.tpCount,
      tp1RR: botConfig.tp1RR,
      tp2RR: botConfig.tp2RR,
      tp3RR: botConfig.tp3RR,
      adaptiveRR: botConfig.adaptiveRR
    }, alert.id);

    const apiKey = botConfig.apiKey;
    const apiSecret = botConfig.apiSecret;
    const passphrase = botConfig.passphrase;
    const environment = botConfig.environment || "demo";
    const exchange = botConfig.exchange || "okx";

    console.log(`🔑 Using ${exchange.toUpperCase()} (${environment}) - API Key: ${apiKey.substring(0, 8)}...`);

    if (exchange !== "okx") {
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'unsupported_exchange',
        errorType: 'configuration_error'
      }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', `Unsupported exchange: ${exchange}. This webhook only supports OKX.`, { exchange }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: `Exchange ${exchange} not supported. Use OKX only.` });
    }

    if (!botConfig.botEnabled) {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'bot_disabled' 
      }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', 'Bot is disabled', { reason: 'bot_disabled' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Bot is disabled" });
    }

    const lockStatus = await checkSymbolLock(data.symbol);
    if (lockStatus.locked) {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'symbol_locked' 
      }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', `Symbol ${data.symbol} is locked: ${lockStatus.reason}`, { 
        symbol: data.symbol,
        lockReason: lockStatus.reason
      }, alert.id);
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        message: `Symbol ${data.symbol} is locked due to: ${lockStatus.reason}` 
      });
    }

    const disabledTiers = JSON.parse(botConfig.disabledTiers || '[]');
    if (disabledTiers.includes(data.tier)) {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'tier_disabled' 
      }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', `Tier ${data.tier} disabled`, { tier: data.tier }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: `Tier ${data.tier} disabled` });
    }

    console.log(`\n🔍 Checking for conflicts...`);
    const conflictAnalysis = await resolveConflict(alert, botConfig);
    
    console.log(`   Conflict type: ${conflictAnalysis.conflictType}`);
    console.log(`   Resolution: ${conflictAnalysis.resolution}`);
    console.log(`   Reason: ${conflictAnalysis.reason}`);
    console.log(`   Should proceed: ${conflictAnalysis.shouldProceed}`);

    if (conflictAnalysis.hasConflict) {
      await logToBot('info', 'conflict_detected', conflictAnalysis.reason, {
        conflictType: conflictAnalysis.conflictType,
        resolution: conflictAnalysis.resolution,
        existingPositionId: conflictAnalysis.existingPosition?.id
      }, alert.id, conflictAnalysis.existingPosition?.id);
    }

    if (conflictAnalysis.resolution === 'REJECT') {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'conflict_rejected' 
      }).where(eq(alerts.id, alert.id));
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        message: conflictAnalysis.reason,
        conflict: true
      });
    }

    if (conflictAnalysis.resolution === 'UPGRADE' && conflictAnalysis.existingPosition) {
      await db.update(botPositions).set({ 
        confirmationCount: conflictAnalysis.existingPosition.confirmationCount + 1,
        lastUpdated: new Date().toISOString(),
      }).where(eq(botPositions.id, conflictAnalysis.existingPosition.id));
      
      await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));
      
      await logToBot('info', 'confirmation_tracked', `Confirmation tracked for ${data.symbol}`, { 
        count: conflictAnalysis.existingPosition.confirmationCount + 1 
      }, alert.id, conflictAnalysis.existingPosition.id);
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        message: "Confirmation tracked",
        conflict: true,
        resolution: 'upgrade'
      });
    }

    if (conflictAnalysis.resolution === 'CLOSE_AND_OPEN' && conflictAnalysis.existingPosition) {
      console.log(`🔄 Reversing position on ${data.symbol}`);
      
      try {
        const closeOrderId = await closeOkxPosition(
          convertSymbolToOkx(data.symbol),
          conflictAnalysis.existingPosition.side,
          conflictAnalysis.existingPosition.quantity,
          apiKey,
          apiSecret,
          passphrase,
          environment === "demo",
          alert.id,
          conflictAnalysis.existingPosition.id
        );

        await db.update(botPositions).set({ 
          status: "closed",
          closeReason: "market_reversal",
          closedAt: new Date().toISOString(),
        }).where(eq(botPositions.id, conflictAnalysis.existingPosition.id));

        await db.insert(botActions).values({
          actionType: "position_closed",
          symbol: data.symbol,
          side: conflictAnalysis.existingPosition.side,
          tier: conflictAnalysis.existingPosition.tier,
          positionId: conflictAnalysis.existingPosition.id,
          reason: "market_reversal",
          details: JSON.stringify({ closeOrderId }),
          success: true,
          createdAt: new Date().toISOString(),
        });

        console.log("✅ Opposite position closed via conflict resolver, proceeding with new trade");
        await logToBot('success', 'reversal_complete', `Position reversed: ${data.symbol}`, {
          closedPositionId: conflictAnalysis.existingPosition.id,
          closeOrderId
        }, alert.id);
        
      } catch (error: any) {
        const errorType = classifyError('', error.message);
        
        await db.update(alerts).set({ 
          executionStatus: 'error_rejected', 
          rejectionReason: 'failed_close_opposite',
          errorType: errorType.type
        }).where(eq(alerts.id, alert.id));
        
        await logToBot('error', 'close_failed', `Failed to close for reversal: ${error.message}`, { 
          error: error.message,
          errorType: errorType.type
        }, alert.id, conflictAnalysis.existingPosition.id);
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: "Failed to close opposite position",
          conflict: true
        });
      }
    }

    // ============================================
    // 🎯 CALCULATE SL/TP (UPDATED: Adaptive R:R + SL as % margin)
    // ============================================

    const entryPrice = parseFloat(data.entryPrice);
    const alertStrength = data.strength || 0.5;
    let slPrice: number | null = null;
    let tp1Price: number | null = null;
    let tp2Price: number | null = null;
    let tp3Price: number | null = null;

    // ============================================
    // ✅ CRITICAL FIX: ZAWSZE używaj SL/TP z ustawień bota
    // Bot IGNORUJE SL/TP z alertów!
    // ============================================
    
    console.log("🎯 Bot IGNORUJE SL/TP z alertu - używa TYLKO ustawień bota");
    
    if (botConfig.useDefaultSlTp) {
      // ✅ Adaptive R:R Logic
      let slRR = botConfig.defaultSlRR || 1.0;
      let tp1RR = botConfig.tp1RR || 1.0;
      let tp2RR = botConfig.tp2RR || 2.0;
      let tp3RR = botConfig.tp3RR || 3.0;
      
      const useAdaptive = botConfig.adaptiveRR && alertStrength >= botConfig.adaptiveStrengthThreshold;
      
      if (useAdaptive) {
        const multiplier = botConfig.adaptiveMultiplier || 1.5;
        const adaptiveFactor = multiplier * alertStrength;
        
        // Adjust all R:R ratios based on signal strength
        slRR = slRR * (1 / adaptiveFactor); // Tighter SL for stronger signals
        tp1RR = tp1RR * adaptiveFactor;
        tp2RR = tp2RR * adaptiveFactor;
        tp3RR = tp3RR * adaptiveFactor;
        
        console.log(`🎯 Adaptive R:R enabled:`);
        console.log(`   Alert strength: ${alertStrength.toFixed(2)}`);
        console.log(`   Multiplier: ${multiplier}`);
        console.log(`   Adaptive factor: ${adaptiveFactor.toFixed(2)}`);
        console.log(`   Adjusted - SL RR: ${slRR.toFixed(2)}, TP1 RR: ${tp1RR.toFixed(2)}, TP2 RR: ${tp2RR.toFixed(2)}, TP3 RR: ${tp3RR.toFixed(2)}`);
        
        await logToBot('info', 'adaptive_rr', `Adaptive R:R applied - strength: ${alertStrength.toFixed(2)}, factor: ${adaptiveFactor.toFixed(2)}`, {
          alertStrength,
          multiplier,
          adaptiveFactor,
          originalSlRR: botConfig.defaultSlRR,
          adaptiveSlRR: slRR,
          originalTp1RR: botConfig.tp1RR,
          adaptiveTp1RR: tp1RR
        }, alert.id);
      }
      
      const tpCount = botConfig.tpCount || 3;
      
      // ✅ SL as % margin calculation
      let positionSizeUsd = botConfig.positionSizeFixed;
      const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;
      
      if (botConfig.slAsMarginPercent) {
        console.log(`\n💰 SL as % margin enabled:`);
        
        const initialMargin = positionSizeUsd / leverage;
        const maxLossUsd = initialMargin * (botConfig.slMarginRiskPercent / 100);
        
        console.log(`   Position size: $${positionSizeUsd}`);
        console.log(`   Leverage: ${leverage}x`);
        console.log(`   Initial margin: $${initialMargin.toFixed(2)}`);
        console.log(`   Max loss (${botConfig.slMarginRiskPercent}% margin): $${maxLossUsd.toFixed(2)}`);
        
        // Get current market price to calculate quantity
        let marketPriceForCalc: number;
        try {
          marketPriceForCalc = await getCurrentMarketPrice(data.symbol, apiKey, apiSecret, passphrase, environment === "demo");
        } catch (error) {
          marketPriceForCalc = entryPrice; // Fallback to entry price
        }
        
        // Calculate quantity (contracts) based on position size
        const coinAmount = positionSizeUsd / marketPriceForCalc;
        
        // For SL calculation: maxLoss = |entryPrice - slPrice| * quantity
        // Therefore: slPrice = entryPrice ± (maxLoss / quantity)
        const slPriceDistance = maxLossUsd / coinAmount;
        
        if (data.side === "BUY") {
          slPrice = entryPrice - slPriceDistance;
        } else {
          slPrice = entryPrice + slPriceDistance;
        }
        
        console.log(`   Coin amount (contracts): ${coinAmount.toFixed(6)}`);
        console.log(`   SL price distance: ${slPriceDistance.toFixed(4)}`);
        console.log(`   SL price: ${slPrice?.toFixed(4)}`);
        
        await logToBot('info', 'sl_margin_calc', `SL calculated as ${botConfig.slMarginRiskPercent}% of margin`, {
          initialMargin,
          maxLossUsd,
          coinAmount,
          slPriceDistance,
          slPrice
        }, alert.id);
      } else {
        // Standard SL calculation (% of entry price)
        if (data.side === "BUY") {
          slPrice = entryPrice * (1 - (slRR / 100));
        } else {
          slPrice = entryPrice * (1 + (slRR / 100));
        }
      }

      // ✅ Calculate TPs as Risk:Reward ratio
      const slDistance = Math.abs(entryPrice - (slPrice || entryPrice));
      
      if (data.side === "BUY") {
        tp1Price = entryPrice + (slDistance * tp1RR);
        if (tpCount >= 2) tp2Price = entryPrice + (slDistance * tp2RR);
        if (tpCount >= 3) tp3Price = entryPrice + (slDistance * tp3RR);
      } else {
        tp1Price = entryPrice - (slDistance * tp1RR);
        if (tpCount >= 2) tp2Price = entryPrice - (slDistance * tp2RR);
        if (tpCount >= 3) tp3Price = entryPrice - (slDistance * tp3RR);
      }

      console.log(`\n🛡️ Enhanced TP strategy: ${tpCount} TPs, Side: ${data.side}`);
      console.log(`   Entry: ${entryPrice}`);
      console.log(`   SL: ${slPrice?.toFixed(4)} (${useAdaptive ? 'Adaptive' : 'Standard'}${botConfig.slAsMarginPercent ? ' as % margin' : ''})`);
      console.log(`   TP1: ${tp1Price?.toFixed(4)} (${botConfig.tp1Percent}%)${useAdaptive ? ' [Adaptive]' : ''}`);
      if (tpCount >= 2) console.log(`   TP2: ${tp2Price?.toFixed(4)} (${botConfig.tp2Percent}%)${useAdaptive ? ' [Adaptive]' : ''}`);
      if (tpCount >= 3) console.log(`   TP3: ${tp3Price?.toFixed(4)} (${botConfig.tp3Percent}%)${useAdaptive ? ' [Adaptive]' : ''}`);
      
      await logToBot('info', 'tp_strategy_enhanced', `Enhanced TP: ${tpCount} levels${useAdaptive ? ' (Adaptive)' : ''}${botConfig.slAsMarginPercent ? ' + SL as margin' : ''}`, {
        source: 'bot_settings',
        alertHadSlTp: !!(data.sl || data.tp1),
        ignoredAlertSlTp: true,
        tpCount,
        useAdaptive,
        slAsMarginPercent: botConfig.slAsMarginPercent,
        slRR,
        tp1RR,
        tp2RR,
        tp3RR,
        entryPrice,
        side: data.side,
        slPrice,
        tp1Price,
        tp2Price,
        tp3Price
      }, alert.id);
    } else {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'no_sl_tp' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'No SL/TP configured in bot settings', { reason: 'no_sl_tp', useDefaultSlTp: botConfig.useDefaultSlTp }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "No SL/TP configured in bot settings" });
    }

    console.log(`🎯 Final TP/SL (FROM BOT SETTINGS) - Side: ${data.side}, Entry: ${entryPrice}, TP1: ${tp1Price}, SL: ${slPrice}`);

    // ============================================
    // 💰 CALCULATE POSITION SIZE
    // ============================================

    let positionSizeUsd = botConfig.positionSizeFixed;
    const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;

    console.log(`💰 Position: $${positionSizeUsd}, Leverage: ${leverage}x`);

    // ============================================
    // 🚀 OPEN POSITION ON OKX (WITH TRANSACTION SAFETY)
    // ============================================

    try {
      const symbol = data.symbol;
      const side = data.side;

      console.log(`\n🔒 Locking symbol ${symbol} ${side} for opening...`);
      trackingId = await lockSymbolForOpening(symbol, side);
      console.log(`✅ Symbol locked with tracking ID: ${trackingId}`);

      await logToBot('info', 'opening_position', `Opening ${symbol} ${side} ${leverage}x on OKX`, { 
        symbol, 
        side, 
        leverage, 
        positionSizeUsd,
        environment,
        trackingId
      }, alert.id);

      let orderId: string;
      let finalQuantity: number;
      let okxSymbol: string;
      
      try {
        const result = await openOkxPosition(
          symbol,
          side,
          positionSizeUsd,
          leverage,
          slPrice,
          tp1Price,
          entryPrice,
          apiKey,
          apiSecret,
          passphrase,
          environment === "demo",
          alert.id,
          parseFloat(data.sl || "0"),
          parseFloat(data.tp1 || "0"),
          botConfig.slAsMarginPercent ? botConfig.slMarginRiskPercent : undefined
        );
        
        orderId = result.orderId;
        finalQuantity = result.quantity;
        okxSymbol = result.okxSymbol;
      } catch (openError: any) {
        const errorType = classifyError(openError.code || '', openError.message);
        
        console.error(`❌ Position opening failed (${errorType.type}):`, openError.message);
        
        if (trackingId) {
          await markPositionOpenFailed(trackingId);
          console.log(`✅ Tracking ${trackingId} marked as failed`);
        }
        
        await db.update(alerts).set({ 
          executionStatus: 'error_rejected', 
          rejectionReason: 'exchange_error',
          errorType: errorType.type
        }).where(eq(alerts.id, alert.id));

        await db.insert(botActions).values({
          actionType: "position_failed",
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          alertId: alert.id,
          reason: "exchange_error",
          details: JSON.stringify({ 
            error: openError.message, 
            exchange: "okx",
            errorType: errorType.type
          }),
          success: false,
          errorMessage: openError.message,
          createdAt: new Date().toISOString(),
        });

        await logToBot('error', 'position_failed', `❌ Position opening failed (${errorType.type}): ${openError.message}`, { 
          error: openError.message,
          errorType: errorType.type,
          symbol: data.symbol
        }, alert.id);

        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: openError.message, 
          errorType: errorType.type,
          message: "Alert saved but position opening failed" 
        });
      }

      try {
        const [botPosition] = await db.insert(botPositions).values({
          symbol: data.symbol,
          side: data.side,
          entryPrice,
          quantity: finalQuantity,
          leverage,
          stopLoss: slPrice || 0,
          tp1Price,
          tp2Price,
          tp3Price,
          mainTpPrice: tp1Price || 0,
          tier: data.tier,
          confidenceScore: data.strength || 0.5,
          confirmationCount: 1,
          tp1Hit: false,
          tp2Hit: false,
          tp3Hit: false,
          currentSl: slPrice || 0,
          positionValue: positionSizeUsd,
          initialMargin: positionSizeUsd / leverage,
          unrealisedPnl: 0,
          status: "open",
          alertId: alert.id,
          bybitOrderId: orderId,
          openedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        }).returning();

        // ✅ CRITICAL FIX #3: Verify actual quantity from exchange after order execution
        console.log(`\n🔍 Verifying actual position quantity from OKX...`);
        try {
          const { data: posData } = await makeOkxRequest(
            'GET',
            `/api/v5/account/positions?instType=SWAP&instId=${okxSymbol}`,
            apiKey,
            apiSecret,
            passphrase,
            environment === "demo",
            undefined,
            alert.id
          );
          
          if (posData.code === '0' && posData.data && posData.data.length > 0) {
            // Find matching position
            const okxPosition = posData.data.find((p: any) => 
              p.instId === okxSymbol && parseFloat(p.pos) !== 0
            );
            
            if (okxPosition) {
              const actualQuantity = Math.abs(parseFloat(okxPosition.pos));
              const actualPnl = parseFloat(okxPosition.upl || "0");
              
              console.log(`   OKX actual quantity: ${actualQuantity} (DB: ${finalQuantity})`);
              console.log(`   OKX unrealised PnL: ${actualPnl}`);
              
              // Update DB with actual values from exchange
              await db.update(botPositions)
                .set({
                  quantity: actualQuantity,
                  unrealisedPnl: actualPnl,
                  lastUpdated: new Date().toISOString()
                })
                .where(eq(botPositions.id, botPosition.id));
              
              console.log(`   ✅ DB updated with actual quantity and PnL`);
              
              await logToBot('info', 'quantity_verified', `Quantity verified from OKX: ${actualQuantity}`, {
                expectedQuantity: finalQuantity,
                actualQuantity,
                difference: Math.abs(actualQuantity - finalQuantity),
                unrealisedPnl: actualPnl
              }, alert.id, botPosition.id);
            } else {
              console.warn(`   ⚠️ Position not found on OKX immediately after opening`);
            }
          }
        } catch (verifyError: any) {
          console.error(`   ⚠️ Failed to verify quantity from OKX:`, verifyError.message);
          await logToBot('warning', 'quantity_verify_failed', `Could not verify quantity: ${verifyError.message}`, {
            error: verifyError.message
          }, alert.id, botPosition.id);
        }

        if (trackingId) {
          await markPositionOpened(trackingId, botPosition.id);
          console.log(`✅ Tracking ${trackingId} marked as active with position ${botPosition.id}`);
        }

        await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));

        await db.insert(botActions).values({
          actionType: "position_opened",
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          alertId: alert.id,
          positionId: botPosition.id,
          reason: "new_signal",
          details: JSON.stringify({ 
            orderId, 
            exchange: "okx", 
            environment, 
            tpLevels: botConfig.tpCount,
            tp1Price,
            tp2Price,
            tp3Price
          }),
          success: true,
          createdAt: new Date().toISOString(),
        });

        await logToBot('success', 'position_opened', `✅ Position opened: ${symbol} ${side} ${leverage}x`, {
          positionId: botPosition.id,
          orderId,
          symbol,
          side,
          leverage,
          quantity: finalQuantity,
          entryPrice,
          sl: slPrice,
          tp1: tp1Price,
          tp2: tp2Price,
          tp3: tp3Price,
          environment
        }, alert.id, botPosition.id);

        // ============================================
        // 🔍 NEW: VERIFY POSITION OPENING (ZADANIE 7)
        // ============================================
        console.log(`\n🔍 Running position verification...`);
        try {
          const verificationResult = await verifyPositionOpening(
            botPosition.id,
            {
              symbol: okxSymbol,
              side: data.side,
              quantity: finalQuantity,
              entryPrice,
              slPrice,
              tp1Price,
              tp2Price,
              tp3Price,
              leverage
            },
            orderId,
            apiKey,
            apiSecret,
            passphrase,
            environment === "demo",
            alert.id,
            botConfig
          );

          if (!verificationResult.success) {
            console.error(`🚨 CRITICAL: Position verification FAILED!`);
            console.error(`   Discrepancies:`, verificationResult.discrepancies);
            
            // ✅ CRITICAL FIX: Sprawdź CZY tylko SL/TP są MISSING
            // Jeśli TAK → nie blokuj symbolu (to może być temporary OKX delay)
            // Jeśli NIE (quantity/entry mają problem) → blokuj symbol
            const onlySlTpMissing = verificationResult.discrepancies.every(d => 
              (d.field === 'slPrice' || d.field === 'tp1Price' || d.field === 'tp2Price' || d.field === 'tp3Price') && 
              d.actual === 'MISSING'
            );
            
            console.log(`   Only SL/TP missing: ${onlySlTpMissing}`);
            
            if (onlySlTpMissing) {
              // ============================================
              // ⚠️ ONLY SL/TP MISSING - LOG WARNING BUT DON'T BLOCK
              // ============================================
              console.log(`   ⚠️ Only SL/TP are missing - this is likely OKX delay`);
              console.log(`   → NOT blocking symbol, position monitor will fix SL/TP later`);
              
              await db.insert(diagnosticFailures).values({
                positionId: botPosition.id,
                failureType: 'sl_tp_delayed',
                reason: `SL/TP not found immediately after opening (OKX delay): ${verificationResult.discrepancies.map(d => d.field).join(', ')}`,
                attemptCount: 1,
                errorDetails: JSON.stringify(verificationResult.discrepancies),
                createdAt: new Date().toISOString()
              });
              
              await logToBot('warning', 'sl_tp_delayed', `SL/TP not found yet - will be fixed by position monitor`, {
                positionId: botPosition.id,
                discrepancies: verificationResult.discrepancies,
                reason: 'okx_propagation_delay'
              }, alert.id, botPosition.id);
              
              // ✅ DON'T close position, DON'T block symbol
              // Position monitor will fix SL/TP automatically
              console.log(`   ✅ Allowing position to stay open - monitor will fix SL/TP`);
              
            } else {
              // ============================================
              // 🚨 CRITICAL ISSUES (quantity/entry problems)
              // ============================================
              console.log(`   🚨 CRITICAL: Not just SL/TP missing - quantity/entry has issues!`);
              
              // ============================================
              // 1. Log błędu w diagnostice
              // ============================================
              await db.insert(diagnosticFailures).values({
                positionId: botPosition.id,
                failureType: 'verification_failed',
                reason: `Position opened with discrepancies: ${verificationResult.discrepancies.map(d => d.field).join(', ')}`,
                attemptCount: 1,
                errorDetails: JSON.stringify(verificationResult.discrepancies),
                createdAt: new Date().toISOString()
              });
              
              await logToBot('error', 'verification_failed', `Position verification failed - ${verificationResult.discrepancies.length} discrepancies`, {
                positionId: botPosition.id,
                discrepancies: verificationResult.discrepancies
              }, alert.id, botPosition.id);
              
              // ============================================
              // 2. Zablokuj symbol
              // ============================================
              console.log(`🔒 Locking symbol ${data.symbol} due to verification failure...`);
              await db.insert(symbolLocks).values({
                symbol: data.symbol,
                lockReason: 'verification_failure',
                lockedAt: new Date().toISOString(),
                failureCount: 1,
                lastError: `Discrepancies detected: ${verificationResult.discrepancies.map(d => `${d.field} (planned: ${d.planned}, actual: ${d.actual})`).join(', ')}`,
                unlockedAt: null,
                isPermanent: false,
                createdAt: new Date().toISOString()
              });
              
              console.log(`✅ Symbol ${data.symbol} locked`);
              await logToBot('warning', 'symbol_locked', `Symbol ${data.symbol} locked due to verification failure`, {
                symbol: data.symbol,
                discrepancyCount: verificationResult.discrepancies.length
              }, alert.id, botPosition.id);
              
              // ============================================
              // 3. Awaryjnie zamknij pozycję
              // ============================================
              console.log(`🚨 Attempting emergency close of position ${botPosition.id}...`);
              try {
                await closeOkxPosition(
                  okxSymbol,
                  side,
                  finalQuantity,
                  apiKey,
                  apiSecret,
                  passphrase,
                  environment === "demo",
                  alert.id,
                  botPosition.id
                );
                
                await db.update(botPositions).set({
                  status: 'closed',
                  closeReason: 'emergency_verification_failure',
                  closedAt: new Date().toISOString()
                }).where(eq(botPositions.id, botPosition.id));
                
                console.log(`✅ Position ${botPosition.id} closed due to verification failure`);
                await logToBot('success', 'emergency_close_verification', `Position ${botPosition.id} closed due to verification failure`, { 
                  discrepancies: verificationResult.discrepancies 
                }, alert.id, botPosition.id);
              } catch (closeError: any) {
                console.error(`❌ Failed to emergency close position:`, closeError.message);
                await logToBot('error', 'emergency_close_failed', `Failed to close position after verification failure: ${closeError.message}`, {
                  closeError: closeError.message,
                  positionId: botPosition.id
                }, alert.id, botPosition.id);
              }
              
              // ============================================
              // 4. Zwróć error response
              // ============================================
              return NextResponse.json({
                success: false,
                alert_id: alert.id,
                position_id: botPosition.id,
                error: 'Position verification failed - symbol locked and position closed',
                discrepancies: verificationResult.discrepancies,
                symbolLocked: true,
                positionClosed: true
              });
            }
          }
          
          console.log(`✅ Position verification PASSED - all values match`);
          await logToBot('success', 'verification_passed', `Position ${botPosition.id} verified successfully`, {
            positionId: botPosition.id
          }, alert.id, botPosition.id);
          
        } catch (verifyError: any) {
          console.error(`⚠️ Verification process failed:`, verifyError.message);
          // Don't block the trade if verification itself fails, just log it
          await logToBot('warning', 'verification_error', `Verification process failed: ${verifyError.message}`, {
            error: verifyError.message,
            positionId: botPosition.id
          }, alert.id, botPosition.id);
        }

        // ✅ CRITICAL FIX #6: Set TP2 and TP3 as separate algo orders if configured
        if (botConfig.tpCount >= 2 && tp2Price) {
          console.log(`\n🎯 Setting TP2 @ ${tp2Price.toFixed(4)}...`);
          try {
            // Get instrument info for tick size
            const { data: instData } = await makeOkxRequest(
              'GET',
              `/api/v5/public/instruments?instType=SWAP&instId=${okxSymbol}`,
              apiKey,
              apiSecret,
              passphrase,
              environment === "demo",
              undefined,
              alert.id
            );
            
            if (instData.code === '0' && instData.data?.[0]) {
              const tickSz = parseFloat(instData.data[0].tickSz);
              
              const tp2OrderId = await addAdditionalTakeProfit(
                okxSymbol,
                side,
                tp2Price,
                finalQuantity,
                tickSz,
                apiKey,
                apiSecret,
                passphrase,
                environment === "demo",
                alert.id
              );
              
              if (tp2OrderId) {
                await db.update(botPositions)
                  .set({ tp2OrderId })
                  .where(eq(botPositions.id, botPosition.id));
                console.log(`   ✅ TP2 order set: ${tp2OrderId}`);
              }
            }
          } catch (error: any) {
            console.error(`   ⚠️ Failed to set TP2:`, error.message);
            await logToBot('warning', 'tp2_failed', `Failed to set TP2: ${error.message}`, { error: error.message }, alert.id, botPosition.id);
          }
        }
        
        if (botConfig.tpCount >= 3 && tp3Price) {
          console.log(`\n🎯 Setting TP3 @ ${tp3Price.toFixed(4)}...`);
          try {
            // Get instrument info for tick size
            const { data: instData } = await makeOkxRequest(
              'GET',
              `/api/v5/public/instruments?instType=SWAP&instId=${okxSymbol}`,
              apiKey,
              apiSecret,
              passphrase,
              environment === "demo",
              undefined,
              alert.id
            );
            
            if (instData.code === '0' && instData.data?.[0]) {
              const tickSz = parseFloat(instData.data[0].tickSz);
              
              const tp3OrderId = await addAdditionalTakeProfit(
                okxSymbol,
                side,
                tp3Price,
                finalQuantity,
                tickSz,
                apiKey,
                apiSecret,
                passphrase,
                environment === "demo",
                alert.id
              );
              
              if (tp3OrderId) {
                await db.update(botPositions)
                  .set({ tp3OrderId })
                  .where(eq(botPositions.id, botPosition.id));
                console.log(`   ✅ TP3 order set: ${tp3OrderId}`);
              }
            }
          } catch (error: any) {
            console.error(`   ⚠️ Failed to set TP3:`, error.message);
            await logToBot('warning', 'tp3_failed', `Failed to set TP3: ${error.message}`, { error: error.message }, alert.id, botPosition.id);
          }
        }

        console.log("\n🔍 Running position monitor immediately after position opening...");
        try {
          const monitorResult = await monitorAndManagePositions(false);
          if (monitorResult.success) {
            console.log(`✅ Monitor completed: TP hits ${monitorResult.tpHits}, SL adj ${monitorResult.slAdjustments}, Fixed ${monitorResult.slTpFixed}`);
          }
        } catch (error) {
          console.error("❌ Monitor failed:", error);
        }

        return NextResponse.json({
          success: true,
          alert_id: alert.id,
          position_id: botPosition.id,
          message: `Position opened`,
          exchange: "okx",
          environment,
          position: { 
            symbol: okxSymbol, 
            side, 
            entry: entryPrice, 
            quantity: finalQuantity, 
            sl: slPrice, 
            tp1: tp1Price, 
            tp2: tp2Price, 
            tp3: tp3Price
          },
          monitorRan: true
        });
        
      } catch (dbError: any) {
        console.error(`🔴 CRITICAL: Position opened on OKX but DB save failed!`, dbError.message);
        
        if (trackingId) {
          await markPositionOpenFailed(trackingId);
        }
        
        await logToBot('error', 'critical_db_failure', `Position ${orderId} opened but DB save failed - attempting emergency close`, {
          orderId,
          symbol: okxSymbol,
          side,
          dbError: dbError.message
        }, alert.id);
        
        try {
          await closeOkxPosition(
            okxSymbol,
            side,
            finalQuantity,
            apiKey,
            apiSecret,
            passphrase,
            environment === "demo",
            alert.id
          );
          
          await logToBot('success', 'emergency_close', `Emergency close successful for ${okxSymbol}`, {
            orderId,
            reason: 'db_save_failed'
          }, alert.id);
        } catch (closeError: any) {
          await logToBot('error', 'emergency_close_failed', `CRITICAL: Failed to emergency close ${okxSymbol}`, {
            orderId,
            closeError: closeError.message
          }, alert.id);
        }
        
        await db.update(alerts).set({ 
          executionStatus: 'error_rejected', 
          rejectionReason: 'db_save_failed',
          errorType: 'database_error'
        }).where(eq(alerts.id, alert.id));
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: 'Position opened but DB save failed - emergency close attempted',
          critical: true
        });
      }

    } catch (error: any) {
      if (trackingId) {
        await markPositionOpenFailed(trackingId);
      }
      
      console.error("❌ Unexpected error:", error);
      
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'unexpected_error',
        errorType: 'unknown'
      }).where(eq(alerts.id, alert.id));
      
      await logToBot('error', 'unexpected_error', `Unexpected error: ${error.message}`, { 
        error: error.message,
        stack: error.stack
      }, alert.id);
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        error: error.message, 
        message: "Alert saved but unexpected error occurred" 
      });
    }
  } catch (error: any) {
    if (trackingId) {
      try {
        await markPositionOpenFailed(trackingId);
      } catch (cleanupError) {
        console.error("Failed to cleanup tracking:", cleanupError);
      }
    }
    
    console.error("❌ Webhook error:", error);
    await logToBot('error', 'webhook_error', `Critical error: ${error.message}`, { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}