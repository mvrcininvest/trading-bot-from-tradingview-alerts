import crypto from 'crypto';

// ============================================
// 🔥 BYBIT API V5 CLIENT - NOWA IMPLEMENTACJA
// ============================================

const BYBIT_API_URL = 'https://api.bybit.com';

interface BybitRequestParams {
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  method: 'GET' | 'POST';
  params?: Record<string, any>;
}

/**
 * Generuje podpis dla Bybit API V5
 */
function generateSignature(
  timestamp: string,
  apiKey: string,
  recvWindow: string,
  queryString: string,
  apiSecret: string
): string {
  const paramStr = timestamp + apiKey + recvWindow + queryString;
  return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
}

/**
 * Wykonuje request do Bybit API V5
 */
async function bybitRequest({
  apiKey,
  apiSecret,
  endpoint,
  method,
  params = {},
}: BybitRequestParams): Promise<any> {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';

  let queryString = '';
  let url = `${BYBIT_API_URL}${endpoint}`;

  if (method === 'GET') {
    queryString = new URLSearchParams(params).toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  } else if (method === 'POST') {
    queryString = JSON.stringify(params);
  }

  const signature = generateSignature(timestamp, apiKey, recvWindow, queryString, apiSecret);

  const headers: Record<string, string> = {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
  };

  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  console.log(`\n🌐 [Bybit Client] ${method} ${endpoint}`);
  console.log(`📝 [Bybit Client] Params:`, params);

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(params) : undefined,
  });

  const data = await response.json();

  console.log(`📊 [Bybit Client] Response:`, {
    retCode: data.retCode,
    retMsg: data.retMsg,
    resultLength: data.result ? Object.keys(data.result).length : 0,
  });

  if (data.retCode !== 0) {
    throw new Error(`Bybit API Error: ${data.retMsg} (Code: ${data.retCode})`);
  }

  return data.result;
}

// ============================================
// 📊 WALLET - POBIERANIE SALDA
// ============================================

export async function getWalletBalance(apiKey: string, apiSecret: string) {
  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/account/wallet-balance',
    method: 'GET',
    params: {
      accountType: 'UNIFIED', // Unified Trading Account
    },
  });
}

// ============================================
// 📈 POSITIONS - POBIERANIE POZYCJI
// ============================================

export async function getPositions(apiKey: string, apiSecret: string, symbol?: string) {
  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/position/list',
    method: 'GET',
    params: {
      category: 'linear',
      settleCoin: 'USDT',
      ...(symbol && { symbol }),
    },
  });
}

// ============================================
// 🚀 TRADE - OTWIERANIE POZYCJI
// ============================================

export async function placeOrder(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    side: 'Buy' | 'Sell';
    orderType: 'Market' | 'Limit';
    qty: string;
    price?: string;
    stopLoss?: string;
    takeProfit?: string;
    leverage?: number;
    positionIdx?: number; // 0: one-way mode, 1: hedge long, 2: hedge short
  }
) {
  // Set leverage first if provided
  if (params.leverage) {
    await setLeverage(apiKey, apiSecret, params.symbol, params.leverage);
  }

  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/order/create',
    method: 'POST',
    params: {
      category: 'linear',
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      qty: params.qty,
      ...(params.price && { price: params.price }),
      ...(params.stopLoss && { stopLoss: params.stopLoss }),
      ...(params.takeProfit && { takeProfit: params.takeProfit }),
      positionIdx: params.positionIdx ?? 0,
    },
  });
}

// ============================================
// 🎯 LEVERAGE - USTAWIANIE DŹWIGNI
// ============================================

export async function setLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number
) {
  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/position/set-leverage',
    method: 'POST',
    params: {
      category: 'linear',
      symbol,
      buyLeverage: leverage.toString(),
      sellLeverage: leverage.toString(),
    },
  });
}

// ============================================
// 🛑 TRADE - ZAMYKANIE POZYCJI
// ============================================

export async function closePosition(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  side: 'Buy' | 'Sell',
  qty: string
) {
  // Close position = place opposite side order
  const closeSide = side === 'Buy' ? 'Sell' : 'Buy';

  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/order/create',
    method: 'POST',
    params: {
      category: 'linear',
      symbol,
      side: closeSide,
      orderType: 'Market',
      qty,
      reduceOnly: true,
      positionIdx: 0,
    },
  });
}

// ============================================
// 🔧 TRADE - MODYFIKACJA SL/TP
// ============================================

export async function setTradingStop(
  apiKey: string,
  apiSecret: string,
  params: {
    symbol: string;
    stopLoss?: string;
    takeProfit?: string;
    positionIdx?: number;
  }
) {
  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/position/trading-stop',
    method: 'POST',
    params: {
      category: 'linear',
      symbol: params.symbol,
      ...(params.stopLoss && { stopLoss: params.stopLoss }),
      ...(params.takeProfit && { takeProfit: params.takeProfit }),
      positionIdx: params.positionIdx ?? 0,
    },
  });
}

// ============================================
// 📜 HISTORY - HISTORIA TRANSAKCJI
// ============================================

export async function getClosedPnL(
  apiKey: string,
  apiSecret: string,
  params?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }
) {
  return bybitRequest({
    apiKey,
    apiSecret,
    endpoint: '/v5/position/closed-pnl',
    method: 'GET',
    params: {
      category: 'linear',
      ...params,
    },
  });
}

// ============================================
// 🔍 UTILITY - KONWERSJA SYMBOLI
// ============================================

export function convertSymbolToBybit(symbol: string): string {
  // Remove any spaces and convert to uppercase
  const clean = symbol.replace(/\s+/g, '').toUpperCase();
  
  // If already in Bybit format (ends with USDT), return as is
  if (clean.endsWith('USDT')) {
    return clean;
  }
  
  // Otherwise, add USDT suffix
  return `${clean}USDT`;
}

export function convertSymbolFromBybit(bybitSymbol: string): string {
  // Remove USDT suffix if present
  return bybitSymbol.replace(/USDT$/, '');
}
