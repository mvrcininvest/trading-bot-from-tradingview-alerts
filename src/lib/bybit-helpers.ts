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
// 🔄 BYBIT HELPERS - WRAPPER FOR NEW CLIENT
// ============================================

import * as BybitClient from './bybit-client';

// Re-export utility functions
export const convertSymbolToBybit = BybitClient.convertSymbolToBybit;
export const convertSymbolFromBybit = BybitClient.convertSymbolFromBybit;

// ============================================
// 📊 GET POSITIONS (Compatible with old code)
// ============================================

export async function getBybitPositions(
  apiKey: string,
  apiSecret: string,
  symbol?: string
): Promise<any[]> {
  const result = await BybitClient.getPositions(apiKey, apiSecret, symbol);
  
  // V5 API returns list in result.list
  return result.list || [];
}

// ============================================
// 📜 GET POSITIONS HISTORY
// ============================================

export async function getBybitPositionsHistory(
  apiKey: string,
  apiSecret: string,
  limit: number = 100
): Promise<any[]> {
  const result = await BybitClient.getClosedPnL(apiKey, apiSecret, {
    limit,
  });
  
  // V5 API returns list in result.list
  return result.list || [];
}

// ============================================
// 🚀 OPEN POSITION
// ============================================

export async function openBybitPosition(
  symbol: string,
  side: string,
  quantity: number,
  leverage: number,
  apiKey: string,
  apiSecret: string,
  tpPrice?: number,
  slPrice?: number
): Promise<{ orderId: string }> {
  const bybitSymbol = convertSymbolToBybit(symbol);
  const bybitSide = side === 'BUY' ? 'Buy' : 'Sell';
  
  const result = await BybitClient.placeOrder(apiKey, apiSecret, {
    symbol: bybitSymbol,
    side: bybitSide,
    orderType: 'Market',
    qty: quantity.toString(),
    leverage,
    ...(tpPrice && { takeProfit: tpPrice.toString() }),
    ...(slPrice && { stopLoss: slPrice.toString() }),
  });
  
  return {
    orderId: result.orderId,
  };
}

// ============================================
// 🛑 CLOSE POSITION
// ============================================

export async function closeBybitPosition(
  symbol: string,
  side: string,
  apiKey: string,
  apiSecret: string,
  quantity?: number
): Promise<string> {
  const bybitSymbol = convertSymbolToBybit(symbol);
  const bybitSide = side === 'BUY' ? 'Buy' : 'Sell';
  
  // If no quantity provided, get current position size
  let qty = quantity?.toString();
  
  if (!qty) {
    const positions = await getBybitPositions(apiKey, apiSecret, bybitSymbol);
    const position = positions.find((p: any) => p.symbol === bybitSymbol && p.side === bybitSide);
    
    if (!position) {
      throw new Error(`No position found for ${symbol} ${side}`);
    }
    
    qty = Math.abs(parseFloat(position.size)).toString();
  }
  
  const result = await BybitClient.closePosition(apiKey, apiSecret, bybitSymbol, bybitSide, qty);
  
  return result.orderId;
}

// ============================================
// 🔧 MODIFY SL/TP
// ============================================

export async function modifyBybitTpSl(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  slPrice?: number,
  tpPrice?: number
): Promise<void> {
  const bybitSymbol = convertSymbolToBybit(symbol);
  
  await BybitClient.setTradingStop(apiKey, apiSecret, {
    symbol: bybitSymbol,
    ...(slPrice && { stopLoss: slPrice.toString() }),
    ...(tpPrice && { takeProfit: tpPrice.toString() }),
  });
}

// ============================================
// 💰 GET CURRENT MARKET PRICE
// ============================================

export async function getCurrentMarketPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<number> {
  const bybitSymbol = convertSymbolToBybit(symbol);
  
  // Get current position to extract market price
  const positions = await getBybitPositions(apiKey, apiSecret, bybitSymbol);
  
  if (positions.length > 0 && positions[0].markPrice) {
    return parseFloat(positions[0].markPrice);
  }
  
  // Fallback: fetch ticker
  const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${bybitSymbol}`);
  const data = await response.json();
  
  if (data.retCode !== 0 || !data.result?.list?.[0]) {
    throw new Error(`Failed to get market price for ${symbol}`);
  }
  
  return parseFloat(data.result.list[0].lastPrice);
}

// ============================================
// 💵 GET REALIZED PNL FROM BYBIT
// ============================================

export async function getRealizedPnlFromBybit(
  orderId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string
): Promise<{ realizedPnl: number } | null> {
  try {
    const bybitSymbol = convertSymbolToBybit(symbol);
    
    // Get recent closed PnL
    const result = await BybitClient.getClosedPnL(apiKey, apiSecret, {
      symbol: bybitSymbol,
      limit: 50,
    });
    
    const pnlList = result.list || [];
    
    // Find matching order by symbol and recent time
    const match = pnlList.find((item: any) => item.symbol === bybitSymbol);
    
    if (match) {
      return {
        realizedPnl: parseFloat(match.closedPnl || '0'),
      };
    }
    
    return null;
  } catch (error) {
    console.error('[getRealizedPnlFromBybit] Error:', error);
    return null;
  }
}

// ============================================
// 💰 GET WALLET BALANCE (FROM OLD VERSION)
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