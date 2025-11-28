import crypto from 'crypto';

// ============================================
// 🔥 BYBIT API V5 CLIENT - FIXED IMPLEMENTATION
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
 * Format: timestamp + apiKey + recvWindow + payload
 */
function generateSignature(
  timestamp: string,
  apiKey: string,
  recvWindow: string,
  payload: string,
  apiSecret: string
): string {
  const signatureString = `${timestamp}${apiKey}${recvWindow}${payload}`;
  console.log(`🔐 [Signature] String: ${signatureString.substring(0, 100)}...`);
  
  const signature = crypto.createHmac('sha256', apiSecret).update(signatureString).digest('hex');
  console.log(`✅ [Signature] HMAC: ${signature.substring(0, 32)}...`);
  
  return signature;
}

/**
 * Sortuje parametry alfabetycznie i tworzy query string
 * CRITICAL: Bybit wymaga alfabetycznej kolejności parametrów!
 */
function buildQueryString(params: Record<string, any>): string {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();
  
  // Build query string manually with sorted keys
  const queryParts: string[] = [];
  for (const key of sortedKeys) {
    const value = params[key];
    if (value !== undefined && value !== null) {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  
  return queryParts.join('&');
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

  let payload = '';
  let url = `${BYBIT_API_URL}${endpoint}`;
  let body: string | undefined;

  if (method === 'GET') {
    // For GET: use alphabetically sorted query string
    payload = buildQueryString(params);
    if (payload) {
      url += `?${payload}`;
    }
  } else if (method === 'POST') {
    // For POST: use JSON body as payload
    body = JSON.stringify(params);
    payload = body;
  }

  const signature = generateSignature(timestamp, apiKey, recvWindow, payload, apiSecret);

  const headers: Record<string, string> = {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature,
    'X-BAPI-RECV-WINDOW': recvWindow,
  };

  // CRITICAL: Only add Content-Type for POST requests
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json';
  }

  console.log(`\n🌐 [Bybit Client] ${method} ${url}`);
  console.log(`📝 [Bybit Client] Payload:`, payload.substring(0, 200));
  console.log(`🔑 [Bybit Client] Headers:`, {
    'X-BAPI-API-KEY': apiKey.substring(0, 8) + '...',
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-SIGN': signature.substring(0, 16) + '...',
    'X-BAPI-RECV-WINDOW': recvWindow,
  });

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  console.log(`📡 [Bybit Client] Response:`, response.status, response.statusText);

  // Check content type before parsing
  const contentType = response.headers.get('content-type');
  
  if (!response.ok) {
    let errorBody = '';
    
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      errorBody = JSON.stringify(errorData, null, 2);
      console.error(`❌ [Bybit API Error]`, errorData);
      
      // Return structured error
      throw new Error(
        `Bybit API Error (${errorData.retCode}): ${errorData.retMsg}`
      );
    } else {
      // HTML or other response
      errorBody = await response.text();
      console.error(`❌ [HTTP Error] ${response.status}:`, errorBody.substring(0, 500));
      
      throw new Error(
        `Bybit HTTP ${response.status}: ${response.statusText}`
      );
    }
  }

  // Parse JSON response
  const data = await response.json();

  console.log(`📊 [Bybit Client] Response:`, {
    retCode: data.retCode,
    retMsg: data.retMsg,
    hasResult: !!data.result,
  });

  if (data.retCode !== 0) {
    console.error(`❌ [Bybit Error]`, data);
    throw new Error(`Bybit API Error (${data.retCode}): ${data.retMsg}`);
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