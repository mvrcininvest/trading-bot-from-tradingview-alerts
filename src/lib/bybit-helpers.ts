import crypto from 'crypto';

const BYBIT_MAINNET_URL = 'https://api.bybit.com';

// ============================================
// 🔐 BYBIT SIGNATURE HELPER
// ============================================

export function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): string {
  const paramString = timestamp + apiKey + '5000' + JSON.stringify(params);
  return crypto.createHmac('sha256', apiSecret).update(paramString).digest('hex');
}

// ============================================
// 🔄 BYBIT API REQUEST HELPER
// ============================================

export async function makeBybitRequest(
  method: string,
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  params?: Record<string, any>,
  body?: any
) {
  const timestamp = Date.now();
  const signature = createBybitSignature(apiKey, apiSecret, timestamp, params || {});
  
  const baseUrl = BYBIT_MAINNET_URL;
  let url = `${baseUrl}${endpoint}`;
  
  if (params && Object.keys(params).length > 0) {
    const queryString = new URLSearchParams(params as any).toString();
    url += `?${queryString}`;
  }

  const headers: Record<string, string> = {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp.toString(),
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': '5000',
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
    qty: quantity.toString(),
    timeInForce: 'GTC',
    positionIdx: 0
  };

  // Add TP/SL if provided
  if (takeProfit) {
    orderPayload.takeProfit = takeProfit.toString();
  }
  if (stopLoss) {
    orderPayload.stopLoss = stopLoss.toString();
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
  console.log(`   Quantity: ${quantity}`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    orderId,
    symbol,
    side,
    quantity
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
