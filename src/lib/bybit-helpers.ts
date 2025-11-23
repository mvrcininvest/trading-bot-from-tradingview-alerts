import crypto from 'crypto';

const BYBIT_MAINNET_URL = 'https://api.bybit.com';

// ============================================
// 🔐 BYBIT SIGNATURE HELPER (FIXED)
// ============================================

export function createBybitSignature(
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
// 🔄 BYBIT API REQUEST HELPER (FIXED)
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
  
  const baseUrl = BYBIT_MAINNET_URL;
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
  
  const signature = createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, paramsString);

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
// 📈 OPEN BYBIT POSITION
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
  // Bybit API has issues with excessive precision (e.g., 0.011894849530153443)
  const roundedQuantity = Math.floor(quantity * 1000) / 1000;
  
  console.log(`\n🔧 Quantity adjustment:`);
  console.log(`   Original: ${quantity}`);
  console.log(`   Rounded (3 decimals): ${roundedQuantity}`);

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

  // Step 2: Place order with TP/SL
  console.log(`\n📈 Placing market order...`);
  
  const orderPayload: any = {
    category: 'linear',
    symbol: symbol,
    side: side === 'BUY' ? 'Buy' : 'Sell',
    orderType: 'Market',
    qty: roundedQuantity.toFixed(3), // ✅ FIX: Use .toFixed(3) for consistent precision
    timeInForce: 'GTC',
    positionIdx: 0
  };

  // Add TP/SL if provided
  if (takeProfit) {
    orderPayload.takeProfit = takeProfit.toFixed(2); // ✅ FIX: Round prices too
  }
  if (stopLoss) {
    orderPayload.stopLoss = stopLoss.toFixed(2); // ✅ FIX: Round prices too
  }

  console.log(`📤 Order payload:`, JSON.stringify(orderPayload, null, 2));

  const data = await makeBybitRequest(
    'POST',
    '/v5/order/create',
    apiKey,
    apiSecret,
    {},
    orderPayload
  );

  const orderId = data.result?.orderId || 'unknown';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ POSITION OPENED SUCCESSFULLY`);
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Symbol: ${symbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Quantity: ${roundedQuantity.toFixed(3)}`);
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