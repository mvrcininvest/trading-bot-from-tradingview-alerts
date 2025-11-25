// ✅ USE FLY.IO PROXY to bypass CloudFlare block
// Direct connection from Vercel is blocked by CloudFlare
const BYBIT_PROXY_URL = process.env.BYBIT_PROXY_URL || 'https://bybit-proxy-dawn-snowflake-6188.fly.dev/proxy/bybit';
const USE_PROXY = true; // Always use proxy from Vercel

// ============================================
// 🔐 BYBIT SIGNATURE HELPER (Web Crypto API for Edge compatibility)
// ============================================

export async function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  params: string
): Promise<string> {
  const message = timestamp + apiKey + recvWindow + params;
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
// 🔄 BYBIT API REQUEST HELPER (FIXED - Direct API)
// ============================================

export async function makeBybitRequest(
  method: string,
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  queryParams?: Record<string, any>,
  body?: any
) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  const baseUrl = BYBIT_PROXY_URL;
  let url = `${baseUrl}${endpoint}`;
  let paramsString = '';
  
  if (method === 'GET' && queryParams && Object.keys(queryParams).length > 0) {
    // For GET requests: use query string
    const queryString = new URLSearchParams(queryParams as any).toString();
    paramsString = queryString;
    url += `?${queryString}`;
  } else if ((method === 'POST' || method === 'PUT') && body) {
    // For POST/PUT requests: use body JSON
    paramsString = JSON.stringify(body);
  }
  
  const signature = await createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, paramsString);

  const headers: Record<string, string> = {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
    'X-BAPI-SIGN-TYPE': '2',
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const responseText = await response.text();

  if (!response.ok) {
    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
      throw new Error('CloudFlare/WAF block (403)');
    }
    throw new Error(`Bybit API error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error: ${data.retMsg}`);
  }

  return data;
}

// ============================================
// 🔄 SYMBOL CONVERSION HELPERS
// ============================================

export function convertSymbolToBybit(symbol: string): string {
  // Remove any existing suffixes and ensure uppercase
  const cleaned = symbol.replace(/\.P$/i, '').replace(/-USDT-SWAP$/i, '').toUpperCase();
  
  // Bybit uses format like: BTCUSDT, ETHUSDT
  if (!cleaned.endsWith('USDT')) {
    return `${cleaned}USDT`;
  }
  
  return cleaned;
}

export function convertSymbolFromBybit(bybitSymbol: string): string {
  // Convert from BTCUSDT to BTC format
  return bybitSymbol.replace('USDT', '');
}

// ============================================
// 📊 GET CURRENT MARKET PRICE
// ============================================

export async function getCurrentMarketPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<number> {
  const data = await makeBybitRequest(
    'GET',
    '/v5/market/tickers',
    apiKey,
    apiSecret,
    {
      category: 'linear',
      symbol: symbol
    }
  );

  if (data.result?.list?.[0]?.lastPrice) {
    return parseFloat(data.result.list[0].lastPrice);
  }

  throw new Error(`Failed to get market price for ${symbol}`);
}

// ============================================
// 📈 OPEN BYBIT POSITION (WITH SL/TP GUARANTEE)
// ============================================

export async function openBybitPosition(
  symbol: string,
  side: string,
  quantity: number,
  leverage: number,
  apiKey: string,
  apiSecret: string,
  takeProfit?: number,
  stopLoss?: number
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 OPENING BYBIT POSITION - START`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Input:`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Quantity: ${quantity}`);
  console.log(`   Leverage: ${leverage}x`);
  console.log(`   Take Profit: ${takeProfit || 'N/A'}`);
  console.log(`   Stop Loss: ${stopLoss || 'N/A'}`);

  // ✅ FIX: Round quantity to 3 decimal places to prevent signing errors
  const roundedQuantity = Math.floor(quantity * 1000) / 1000;
  
  console.log(`\n🔧 Quantity adjustment:`);
  console.log(`   Original: ${quantity}`);
  console.log(`   Rounded (3 decimals): ${roundedQuantity}`);

  // Get current market price for entry estimation
  const currentPrice = await getCurrentMarketPrice(symbol, apiKey, apiSecret);
  console.log(`\n💰 Current Market Price: ${currentPrice}`);

  // ✅ CRITICAL FIX: Validate TP/SL direction based on side AND entry price
  const isLong = side === 'BUY';
  
  // Use current price as entry estimate (market orders fill at current price)
  const estimatedEntry = currentPrice;

  console.log(`\n🔍 TP/SL Validation (Side: ${side}):`);
  console.log(`   Estimated Entry: ${estimatedEntry}`);
  
  // Validate TP direction
  if (takeProfit) {
    console.log(`   Original TP: ${takeProfit}`);
    
    if (isLong && takeProfit <= estimatedEntry) {
      console.warn(`   ⚠️ INVALID TP for LONG: ${takeProfit} must be ABOVE ${estimatedEntry}`);
      console.warn(`   🔧 Auto-fixing: Setting TP to 0.5% above entry...`);
      takeProfit = estimatedEntry * 1.005;
      console.warn(`   ✅ New TP: ${takeProfit.toFixed(4)}`);
    } else if (!isLong && takeProfit >= estimatedEntry) {
      console.warn(`   ⚠️ INVALID TP for SHORT: ${takeProfit} must be BELOW ${estimatedEntry}`);
      console.warn(`   🔧 Auto-fixing: Setting TP to 0.5% below entry...`);
      takeProfit = estimatedEntry * 0.995;
      console.warn(`   ✅ New TP: ${takeProfit.toFixed(4)}`);
    } else {
      console.log(`   ✅ TP direction valid`);
    }
  }

  // Validate SL direction
  if (stopLoss) {
    console.log(`   Original SL: ${stopLoss}`);
    
    if (isLong && stopLoss >= estimatedEntry) {
      console.warn(`   ⚠️ INVALID SL for LONG: ${stopLoss} must be BELOW ${estimatedEntry}`);
      console.warn(`   🔧 Auto-fixing: Setting SL to 1% below entry...`);
      stopLoss = estimatedEntry * 0.99;
      console.warn(`   ✅ New SL: ${stopLoss.toFixed(4)}`);
    } else if (!isLong && stopLoss <= estimatedEntry) {
      console.warn(`   ⚠️ INVALID SL for SHORT: ${stopLoss} must be ABOVE ${estimatedEntry}`);
      console.warn(`   🔧 Auto-fixing: Setting SL to 1% above entry...`);
      stopLoss = estimatedEntry * 1.01;
      console.warn(`   ✅ New SL: ${stopLoss.toFixed(4)}`);
    } else {
      console.log(`   ✅ SL direction valid`);
    }
  }

  console.log(`\n✅ Final TP/SL after validation:`);
  console.log(`   Take Profit: ${takeProfit?.toFixed(4) || 'N/A'}`);
  console.log(`   Stop Loss: ${stopLoss?.toFixed(4) || 'N/A'}`);

  // Step 1: Set leverage
  console.log(`\n📏 Setting leverage to ${leverage}x...`);
  try {
    await makeBybitRequest(
      'POST',
      '/v5/position/set-leverage',
      apiKey,
      apiSecret,
      {},
      {
        category: 'linear',
        symbol: symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      }
    );
    console.log(`✅ Leverage set: ${leverage}x`);
  } catch (error: any) {
    console.warn(`⚠️ Leverage setting: ${error.message}`);
  }

  // Step 2: Place order WITHOUT TP/SL (we'll set them separately for guarantee)
  console.log(`\n📈 Placing market order (without TP/SL in payload)...`);
  console.log(`   ⚠️ NOTE: TP/SL will be set SEPARATELY to guarantee they are applied`);
  
  const orderPayload: any = {
    category: 'linear',
    symbol: symbol,
    side: side === 'BUY' ? 'Buy' : 'Sell',
    orderType: 'Market',
    qty: roundedQuantity.toFixed(3),
    timeInForce: 'GTC',
    positionIdx: 0
  };

  // 🚨 CRITICAL: DO NOT add TP/SL to order payload
  // Bybit can silently ignore them if invalid, leaving position without protection
  // We'll set them separately after position is open

  console.log(`📤 Order payload (NO TP/SL):`, JSON.stringify(orderPayload, null, 2));

  const data = await makeBybitRequest(
    'POST',
    '/v5/order/create',
    apiKey,
    apiSecret,
    {},
    orderPayload
  );

  const orderId = data.result?.orderId || 'unknown';

  console.log(`\n✅ ORDER PLACED - Order ID: ${orderId}`);

  // 🚨 CRITICAL: IMMEDIATE VERIFICATION & SL/TP SETUP
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🛡️ CRITICAL SAFETY CHECK - SETTING SL/TP`);
  console.log(`${'='.repeat(60)}`);

  // Wait for position to open (Bybit needs ~500ms)
  console.log(`⏳ Waiting 1s for position to settle...`);
  await new Promise(resolve => setTimeout(resolve, 1000));

  let slTpSetSuccess = false;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 Attempt ${attempt}/${maxAttempts} to set SL/TP...`);

    try {
      // Get actual position to check entry price
      const positions = await getBybitPositions(apiKey, apiSecret, symbol);
      const actualPosition = positions.find((p: any) => 
        p.symbol === symbol && parseFloat(p.size) > 0
      );

      if (!actualPosition) {
        console.error(`   ❌ Position not found on exchange!`);
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        throw new Error('Position not found on exchange after opening');
      }

      const actualEntry = parseFloat(actualPosition.avgPrice);
      const actualSide = actualPosition.side;

      console.log(`   📊 Actual position data:`);
      console.log(`      Entry: ${actualEntry}`);
      console.log(`      Side: ${actualSide}`);
      console.log(`      Size: ${actualPosition.size}`);

      // Recalculate TP/SL based on ACTUAL entry (not estimated)
      let finalTP = takeProfit;
      let finalSL = stopLoss;

      if (finalTP) {
        // Ensure TP is in correct direction relative to ACTUAL entry
        if (actualSide === 'Buy' && finalTP <= actualEntry) {
          console.warn(`      ⚠️ TP too close/wrong - adjusting to 0.5% above actual entry`);
          finalTP = actualEntry * 1.005;
        } else if (actualSide === 'Sell' && finalTP >= actualEntry) {
          console.warn(`      ⚠️ TP too close/wrong - adjusting to 0.5% below actual entry`);
          finalTP = actualEntry * 0.995;
        }
      }

      if (finalSL) {
        // Ensure SL is in correct direction relative to ACTUAL entry
        if (actualSide === 'Buy' && finalSL >= actualEntry) {
          console.warn(`      ⚠️ SL too close/wrong - adjusting to 1% below actual entry`);
          finalSL = actualEntry * 0.99;
        } else if (actualSide === 'Sell' && finalSL <= actualEntry) {
          console.warn(`      ⚠️ SL too close/wrong - adjusting to 1% above actual entry`);
          finalSL = actualEntry * 1.01;
        }
      }

      console.log(`   🎯 Final TP/SL (adjusted to actual entry):`);
      console.log(`      TP: ${finalTP?.toFixed(4) || 'N/A'}`);
      console.log(`      SL: ${finalSL?.toFixed(4) || 'N/A'}`);

      // Set TP/SL using trading-stop endpoint
      const tpslPayload: any = {
        category: 'linear',
        symbol: symbol,
        positionIdx: 0
      };

      if (finalTP) tpslPayload.takeProfit = finalTP.toString();
      if (finalSL) tpslPayload.stopLoss = finalSL.toString();

      console.log(`   📤 Setting TP/SL via trading-stop...`);
      
      await makeBybitRequest(
        'POST',
        '/v5/position/trading-stop',
        apiKey,
        apiSecret,
        {},
        tpslPayload
      );

      console.log(`   ✅ TP/SL SET SUCCESSFULLY`);

      // VERIFY they were actually set
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const verifyPositions = await getBybitPositions(apiKey, apiSecret, symbol);
      const verifyPosition = verifyPositions.find((p: any) => 
        p.symbol === symbol && parseFloat(p.size) > 0
      );

      if (verifyPosition) {
        const hasSL = verifyPosition.stopLoss && parseFloat(verifyPosition.stopLoss) > 0;
        const hasTP = verifyPosition.takeProfit && parseFloat(verifyPosition.takeProfit) > 0;

        console.log(`\n   🔍 VERIFICATION:`);
        console.log(`      SL on exchange: ${hasSL ? verifyPosition.stopLoss : 'NOT SET'}`);
        console.log(`      TP on exchange: ${hasTP ? verifyPosition.takeProfit : 'NOT SET'}`);

        if (finalSL && !hasSL) {
          throw new Error('SL was not set on exchange!');
        }
        if (finalTP && !hasTP) {
          throw new Error('TP was not set on exchange!');
        }

        console.log(`   ✅✅✅ VERIFIED - SL/TP ARE SET ON EXCHANGE!`);
        slTpSetSuccess = true;
        break;
      }

    } catch (error: any) {
      console.error(`   ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxAttempts) {
        console.log(`   ⏳ Waiting ${1000 * attempt}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  if (!slTpSetSuccess) {
    console.error(`\n🚨🚨🚨 CRITICAL FAILURE: COULD NOT SET SL/TP AFTER ${maxAttempts} ATTEMPTS!`);
    console.error(`   This position is UNPROTECTED - EMERGENCY CLOSE REQUIRED!`);
    
    // Emergency close
    try {
      console.log(`   🚨 Executing emergency close...`);
      await closeBybitPosition(symbol, side, apiKey, apiSecret);
      console.error(`   ✅ Position emergency closed - funds protected`);
      
      throw new Error(`EMERGENCY: Position opened but SL/TP could not be set - position was closed for safety`);
    } catch (closeError: any) {
      console.error(`   ❌❌❌ EMERGENCY CLOSE FAILED: ${closeError.message}`);
      console.error(`   🚨 MANUAL INTERVENTION REQUIRED - POSITION WITHOUT SL/TP!`);
      throw new Error(`CRITICAL: Position opened without SL/TP and emergency close failed - manual intervention required!`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ POSITION OPENED SUCCESSFULLY WITH SL/TP GUARANTEE`);
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Quantity: ${roundedQuantity.toFixed(3)}`);
  console.log(`   SL/TP: VERIFIED AND SET`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    orderId,
    symbol,
    side,
    quantity: roundedQuantity
  };
}

// ============================================
// 🔄 CLOSE BYBIT POSITION
// ============================================

export async function closeBybitPosition(
  symbol: string,
  side: string,
  apiKey: string,
  apiSecret: string
) {
  console.log(`🔄 Closing Bybit position: ${symbol} ${side}`);

  const orderPayload = {
    category: 'linear',
    symbol: symbol,
    side: side === 'BUY' ? 'Sell' : 'Buy',
    orderType: 'Market',
    qty: '0', // Close entire position
    reduceOnly: true,
    closeOnTrigger: false,
    timeInForce: 'GTC',
    positionIdx: 0
  };

  const data = await makeBybitRequest(
    'POST',
    '/v5/order/create',
    apiKey,
    apiSecret,
    {},
    orderPayload
  );

  const orderId = data.result?.orderId || 'unknown';
  console.log('✅ Bybit position closed:', orderId);

  return orderId;
}

// ============================================
// 🎯 MODIFY TP/SL
// ============================================

export async function modifyBybitTpSl(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  takeProfit?: number,
  stopLoss?: number
) {
  console.log(`🎯 Modifying TP/SL for ${symbol}`);

  const payload: any = {
    category: 'linear',
    symbol: symbol,
    positionIdx: 0
  };

  if (takeProfit) {
    payload.takeProfit = takeProfit.toString();
  }
  if (stopLoss) {
    payload.stopLoss = stopLoss.toString();
  }

  await makeBybitRequest(
    'POST',
    '/v5/position/trading-stop',
    apiKey,
    apiSecret,
    {},
    payload
  );

  console.log('✅ TP/SL modified successfully');
}

// ============================================
// 📊 GET POSITIONS
// ============================================

export async function getBybitPositions(
  apiKey: string,
  apiSecret: string,
  symbol?: string
) {
  const params: any = {
    category: 'linear',
    settleCoin: 'USDT'
  };

  if (symbol) {
    params.symbol = symbol;
  }

  const data = await makeBybitRequest(
    'GET',
    '/v5/position/list',
    apiKey,
    apiSecret,
    params
  );

  if (!data.result?.list) {
    return [];
  }

  // Filter only open positions
  return data.result.list.filter((p: any) => parseFloat(p.size) > 0);
}

// ============================================
// 📜 GET ALGO ORDERS (SL/TP ORDERS)
// ============================================

export async function getBybitAlgoOrders(
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  try {
    const data = await makeBybitRequest(
      'GET',
      '/v5/order/realtime',
      apiKey,
      apiSecret,
      {
        category: 'linear',
        settleCoin: 'USDT'
      }
    );

    if (!data.result?.list) {
      return [];
    }

    // Return all active orders (TP/SL are stored in position, not as separate orders in Bybit V5)
    // We'll get TP/SL from position data instead
    return data.result.list || [];
  } catch (error: any) {
    console.error('Failed to get Bybit algo orders:', error.message);
    return [];
  }
}

// ============================================
// 🗑️ CANCEL BYBIT ALGO ORDER
// ============================================

export async function cancelBybitAlgoOrder(
  orderId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<boolean> {
  try {
    await makeBybitRequest(
      'POST',
      '/v5/order/cancel',
      apiKey,
      apiSecret,
      {},
      {
        category: 'linear',
        symbol: symbol,
        orderId: orderId
      }
    );
    
    console.log(`✅ Cancelled algo order: ${orderId}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to cancel algo order ${orderId}:`, error.message);
    return false;
  }
}

// ============================================
// 📜 GET POSITIONS HISTORY
// ============================================

export async function getBybitPositionsHistory(
  apiKey: string,
  apiSecret: string,
  limit: number = 100
): Promise<any[]> {
  try {
    const data = await makeBybitRequest(
      'GET',
      '/v5/position/closed-pnl',
      apiKey,
      apiSecret,
      {
        category: 'linear',
        limit: limit.toString()
      }
    );

    if (!data.result?.list) {
      return [];
    }

    return data.result.list;
  } catch (error: any) {
    console.error('Failed to get Bybit positions history:', error.message);
    return [];
  }
}

// ============================================
// 💰 GET WALLET BALANCE
// ============================================

export async function getBybitWalletBalance(
  apiKey: string,
  apiSecret: string
) {
  const data = await makeBybitRequest(
    'GET',
    '/v5/account/wallet-balance',
    apiKey,
    apiSecret,
    {
      accountType: 'UNIFIED'
    }
  );

  const balances: Array<{ asset: string; free: string; locked: string }> = [];

  if (data.result?.list?.[0]?.coin) {
    data.result.list[0].coin.forEach((coin: any) => {
      const free = parseFloat(coin.availableToWithdraw || coin.walletBalance || '0');
      const locked = parseFloat(coin.locked || '0');

      if (free > 0 || locked > 0) {
        balances.push({
          asset: coin.coin,
          free: free.toFixed(8),
          locked: locked.toFixed(8),
        });
      }
    });
  }

  return {
    success: true,
    balances,
    canTrade: true
  };
}

// ============================================
// 💰 GET REALIZED PNL FROM BYBIT
// ============================================

export async function getRealizedPnlFromBybit(
  orderId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<{ realizedPnl: number; fillPrice: number } | null> {
  try {
    console.log(`💰 Getting realized PnL for order ${orderId}...`);

    // Get order details
    const data = await makeBybitRequest(
      'GET',
      '/v5/order/history',
      apiKey,
      apiSecret,
      {
        category: 'linear',
        symbol: symbol,
        orderId: orderId,
        limit: '1'
      }
    );

    if (!data.result?.list?.[0]) {
      console.warn(`⚠️ Order ${orderId} not found in history`);
      return null;
    }

    const order = data.result.list[0];
    const avgPrice = parseFloat(order.avgPrice || '0');
    
    if (avgPrice === 0) {
      console.warn(`⚠️ Order ${orderId} has no fill price`);
      return null;
    }

    // Get closed PnL data
    const pnlData = await makeBybitRequest(
      'GET',
      '/v5/position/closed-pnl',
      apiKey,
      apiSecret,
      {
        category: 'linear',
        symbol: symbol,
        limit: '50'
      }
    );

    if (!pnlData.result?.list) {
      console.warn(`⚠️ No closed PnL data found`);
      return null;
    }

    // Find matching PnL entry by order ID
    const pnlEntry = pnlData.result.list.find((entry: any) => 
      entry.orderId === orderId
    );

    if (!pnlEntry) {
      console.warn(`⚠️ No PnL entry found for order ${orderId}`);
      return null;
    }

    const realizedPnl = parseFloat(pnlEntry.closedPnl || '0');
    
    console.log(`✅ Realized PnL: ${realizedPnl.toFixed(2)} USD, Fill Price: ${avgPrice}`);

    return {
      realizedPnl,
      fillPrice: avgPrice
    };
  } catch (error: any) {
    console.error(`❌ Failed to get realized PnL:`, error.message);
    return null;
  }
}

// ============================================
// 🧹 CLEANUP ORPHANED ORDERS
// ============================================

export async function cleanupOrphanedOrders(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  maxRetries: number = 3
): Promise<{
  success: boolean;
  cancelledCount: number;
  failedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let cancelledCount = 0;
  let failedCount = 0;

  try {
    console.log(`🧹 Cleaning up orphaned orders for ${symbol}...`);

    // Get all open orders for this symbol
    const data = await makeBybitRequest(
      'GET',
      '/v5/order/realtime',
      apiKey,
      apiSecret,
      {
        category: 'linear',
        symbol: symbol
      }
    );

    const orders = data.result?.list || [];

    if (orders.length === 0) {
      console.log(`✅ No orders to clean up for ${symbol}`);
      return { success: true, cancelledCount: 0, failedCount: 0, errors: [] };
    }

    console.log(`📋 Found ${orders.length} order(s) to cancel`);

    // Cancel all orders with retry
    for (const order of orders) {
      let cancelled = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await makeBybitRequest(
            'POST',
            '/v5/order/cancel',
            apiKey,
            apiSecret,
            {},
            {
              category: 'linear',
              symbol: symbol,
              orderId: order.orderId
            }
          );

          console.log(`   ✅ Cancelled order ${order.orderId} (attempt ${attempt})`);
          cancelledCount++;
          cancelled = true;
          break;
        } catch (error: any) {
          console.error(`   ❌ Attempt ${attempt}/${maxRetries} failed:`, error.message);
          
          if (attempt === maxRetries) {
            errors.push(`Failed to cancel ${order.orderId}: ${error.message}`);
            failedCount++;
          } else {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        }
      }
    }

    const success = failedCount === 0;
    console.log(`${success ? '✅' : '⚠️'} Cleanup complete: ${cancelledCount} cancelled, ${failedCount} failed`);

    return {
      success,
      cancelledCount,
      failedCount,
      errors
    };
  } catch (error: any) {
    const errMsg = `Cleanup failed: ${error.message}`;
    console.error(`❌ ${errMsg}`);
    errors.push(errMsg);
    
    return {
      success: false,
      cancelledCount,
      failedCount,
      errors
    };
  }
}

// ============================================
// 🔐 BYBIT CREDENTIALS TYPE
// ============================================

export interface BybitCredentials {
  apiKey: string;
  apiSecret: string;
}