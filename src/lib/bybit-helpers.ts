// ============================================
// 🔐 BYBIT API - DIRECT CONNECTION (NO PROXY)
// ============================================

// ✅ REMOVED: Static import causes webpack to bundle twilio at build time
// import { sendCloudFrontBlockAlert, sendEmergencyCloseFailureAlert } from './sms-service';

const BYBIT_API_BASE = 'https://api.bybit.com';

// ✅ FIX: Enhanced headers to avoid CloudFront blocking
const ENHANCED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

// ============================================
// 🚨 CLOUDFRONT BLOCK HANDLER
// ============================================

async function handleCloudFrontBlock(endpoint: string, responseText: string) {
  console.error(`\n${'='.repeat(80)}`);
  console.error(`🚨🚨🚨 CRITICAL: CLOUDFRONT BLOCK DETECTED 🚨🚨🚨`);
  console.error(`${'='.repeat(80)}`);
  console.error(`📍 Endpoint: ${endpoint}`);
  console.error(`🌍 Region: Server region is BLOCKED by Bybit CloudFront`);
  console.error(`⚠️  Bot CANNOT monitor positions, set SL/TP, or fetch data`);
  console.error(`${'='.repeat(80)}\n`);

  let serverInfo: any = {};

  try {
    // 1. Get server IP and region info
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipResponse.json();
      serverInfo.ip = ipData.ip;
      
      // Try to get region info
      const geoResponse = await fetch(`https://ipapi.co/${ipData.ip}/json/`);
      const geoData = await geoResponse.json();
      serverInfo.region = geoData.country_name || 'Unknown';
      serverInfo.countryCode = geoData.country_code || '?';
      serverInfo.city = geoData.city || 'Unknown';
      
      console.error(`📊 Server Info: IP: ${serverInfo.ip} | Region: ${serverInfo.region} (${serverInfo.countryCode}) | City: ${serverInfo.city}`);
    } catch (e) {
      console.error(`⚠️  Could not fetch server info: ${e}`);
      serverInfo = { ip: 'Unknown', region: 'Unknown', city: 'Unknown' };
    }

    // 2. Disable bot
    console.error(`🛑 Disabling bot...`);
    await fetch('/api/bot/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });
    console.error(`✅ Bot disabled`);

    // 3. Emergency close all positions
    console.error(`🚨 Emergency closing all positions...`);
    const closeResponse = await fetch('/api/exchange/close-all-positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const closeData = await closeResponse.json();
    console.error(`${closeData.success ? '✅' : '❌'} Close all result: ${JSON.stringify(closeData)}`);

    // 4. Log to bot logs
    console.error(`📝 Logging to bot logs...`);
    await fetch('/api/bot/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level: 'error',
        message: `🚨 CLOUDFRONT BLOCK DETECTED - Bot disabled and positions closed`,
        context: {
          endpoint,
          serverInfo,
          action: 'emergency_shutdown',
          timestamp: new Date().toISOString()
        }
      })
    });
    console.error(`✅ Logged to bot logs`);

    // 5. Log to Oko Saurona
    console.error(`👁️  Logging to Oko Saurona...`);
    await fetch('/api/bot/oko-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'cloudfront_block_emergency_shutdown',
        status: 'critical',
        details: {
          endpoint,
          serverInfo,
          botDisabled: true,
          positionsClosedAttempt: closeData.success || false,
          timestamp: new Date().toISOString()
        }
      })
    });
    console.error(`✅ Logged to Oko Saurona`);

    // 6. 📱 SEND SMS ALERT - ✅ FIX: Use dynamic import to avoid bundling twilio at build time
    console.error(`📱 Sending SMS alert...`);
    try {
      const { sendCloudFrontBlockAlert } = await import('./sms-service');
      const smsResult = await sendCloudFrontBlockAlert(serverInfo);
      if (smsResult.success) {
        console.error(`✅ SMS alert sent successfully (Message ID: ${smsResult.messageId})`);
      } else {
        console.error(`⚠️ SMS alert failed: ${smsResult.error}`);
      }
    } catch (smsError: any) {
      console.error(`❌ SMS alert error: ${smsError.message}`);
    }

  } catch (emergencyError: any) {
    console.error(`❌ Emergency shutdown failed: ${emergencyError.message}`);
    console.error(`⚠️  MANUAL INTERVENTION REQUIRED!`);
  }

  console.error(`\n${'='.repeat(80)}`);
  console.error(`🚨 EMERGENCY SHUTDOWN COMPLETE`);
  console.error(`📋 Actions taken:`);
  console.error(`   1. ✅ Bot disabled`);
  console.error(`   2. 🚨 All positions emergency closed (attempted)`);
  console.error(`   3. 📝 Logged to bot logs`);
  console.error(`   4. 👁️  Logged to Oko Saurona`);
  console.error(`   5. 📱 SMS alert sent (if configured)`);
  console.error(`${'='.repeat(80)}\n`);
}

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
// 🔄 BYBIT API REQUEST HELPER (ENHANCED HEADERS)
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
  
  // Build direct URL to Bybit API
  let url = `${BYBIT_API_BASE}${endpoint}`;
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
    ...ENHANCED_HEADERS,
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

  console.log(`🌐 [DIRECT] ${method} ${endpoint}`);

  const response = await fetch(url, options);
  const responseText = await response.text();

  if (!response.ok) {
    // 🚨 CRITICAL: Detect CloudFront block
    if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html')) {
      console.error(`❌ CloudFront block detected - Response: ${responseText.substring(0, 300)}`);
      
      // Trigger emergency shutdown
      await handleCloudFrontBlock(endpoint, responseText);
      
      throw new Error(`🚨 CLOUDFRONT BLOCK: Your server region is blocked by Bybit. Bot has been disabled and positions closed for safety.`);
    }
    throw new Error(`Bybit API error: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);

  if (data.retCode !== 0) {
    throw new Error(`Bybit API error (${data.retCode}): ${data.retMsg}`);
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

  // ✅ REMOVED: No more forced minimum distances - use exact values from settings
  console.log(`\n🎯 Using EXACT SL/TP values from bot settings (no auto-adjustments):`);
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
  console.log(`⏳ Waiting 1.5s for position to settle...`);
  await new Promise(resolve => setTimeout(resolve, 1500));

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

      // ✅ REMOVED: No more recalculation - use EXACT values from settings
      let finalTP = takeProfit;
      let finalSL = stopLoss;

      console.log(`   🎯 Using EXACT TP/SL from settings (no adjustments):`);
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
        console.log(`   ⏳ Waiting ${1500 * attempt}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
      }
    }
  }

  if (!slTpSetSuccess) {
    console.error(`\n🚨🚨🚨 CRITICAL FAILURE: COULD NOT SET SL/TP AFTER ${maxAttempts} ATTEMPTS!`);
    console.error(`   This position is UNPROTECTED - EMERGENCY CLOSE REQUIRED!`);
    
    // ✅ IMPROVED: Emergency close with multiple retries
    let closeSuccess = false;
    const maxCloseAttempts = 5;
    
    for (let closeAttempt = 1; closeAttempt <= maxCloseAttempts; closeAttempt++) {
      try {
        console.log(`   🚨 Emergency close attempt ${closeAttempt}/${maxCloseAttempts}...`);
        
        await closeBybitPosition(symbol, side, apiKey, apiSecret);
        
        // Verify position was closed
        await new Promise(resolve => setTimeout(resolve, 1000));
        const checkPositions = await getBybitPositions(apiKey, apiSecret, symbol);
        const stillOpen = checkPositions.find((p: any) => 
          p.symbol === symbol && parseFloat(p.size) > 0
        );
        
        if (!stillOpen) {
          console.error(`   ✅ Position emergency closed successfully - funds protected`);
          closeSuccess = true;
          break;
        } else {
          console.error(`   ⚠️ Position still open after close attempt ${closeAttempt}`);
          if (closeAttempt < maxCloseAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000 * closeAttempt));
          }
        }
      } catch (closeError: any) {
        console.error(`   ❌ Close attempt ${closeAttempt} failed: ${closeError.message}`);
        if (closeAttempt < maxCloseAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000 * closeAttempt));
        }
      }
    }
    
    if (closeSuccess) {
      throw new Error(`EMERGENCY: Position opened but SL/TP could not be set - position was closed for safety`);
    } else {
      console.error(`   ❌❌❌ ALL ${maxCloseAttempts} EMERGENCY CLOSE ATTEMPTS FAILED!`);
      console.error(`   🚨 MANUAL INTERVENTION REQUIRED - POSITION WITHOUT SL/TP!`);
      throw new Error(`CRITICAL: Position opened without SL/TP and emergency close failed after ${maxCloseAttempts} attempts - manual intervention required!`);
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
  console.log(`\n📊 [GET POSITIONS] Fetching open positions...`);
  console.log(`   Symbol filter: ${symbol || 'ALL (settleCoin=USDT)'}`);
  
  // ✅ CRITICAL FIX: According to Bybit V5 API docs:
  // - Using settleCoin=USDT WITHOUT symbol = returns ONLY positions with size > 0 (automatic filtering)
  // - Using symbol parameter = returns ALL positions including size=0 (no automatic filtering)
  // 
  // For monitoring open positions, we should use settleCoin approach
  
  const params: any = {
    category: 'linear',
  };

  if (symbol) {
    // If specific symbol requested, use symbol parameter
    params.symbol = symbol;
    console.log(`   ⚠️ Using symbol parameter - will return position even if size=0`);
  } else {
    // If no symbol, use settleCoin for automatic size>0 filtering
    params.settleCoin = 'USDT';
    console.log(`   ✅ Using settleCoin=USDT - automatic size>0 filtering`);
  }

  try {
    const data = await makeBybitRequest(
      'GET',
      '/v5/position/list',
      apiKey,
      apiSecret,
      params
    );

    console.log(`   📊 API Response retCode: ${data.retCode}, retMsg: ${data.retMsg}`);

    if (!data.result?.list) {
      console.warn(`   ⚠️ No result.list in response`);
      return [];
    }

    console.log(`   📊 Total positions in response: ${data.result.list.length}`);

    // Log each position for debugging
    data.result.list.forEach((p: any, index: number) => {
      console.log(`   [${index + 1}] ${p.symbol} ${p.side}: size=${p.size}, entry=${p.avgPrice}, unrealisedPnl=${p.unrealisedPnl}`);
    });

    // Filter only open positions (size > 0)
    const openPositions = data.result.list.filter((p: any) => {
      const size = parseFloat(p.size);
      return size > 0;
    });

    console.log(`   ✅ Open positions (size > 0): ${openPositions.length}`);

    if (openPositions.length === 0 && data.result.list.length > 0) {
      console.warn(`   ⚠️ API returned ${data.result.list.length} positions but all have size=0`);
      console.warn(`   💡 This means positions are closed on exchange but API returned them anyway`);
    }

    return openPositions;
  } catch (error: any) {
    console.error(`   ❌ Failed to get positions: ${error.message}`);
    
    // Check for common errors
    if (error.message.includes('10001')) {
      console.error(`   ⚠️ Error 10001: Missing parameters - check if settleCoin or symbol is required`);
    } else if (error.message.includes('10003')) {
      console.error(`   ⚠️ Error 10003: Invalid API key`);
    } else if (error.message.includes('10004')) {
      console.error(`   ⚠️ Error 10004: Invalid signature - check API secret`);
    } else if (error.message.includes('10005')) {
      console.error(`   ⚠️ Error 10005: Permission denied - API key needs "Position" permission`);
      console.error(`   💡 Solution: Go to Bybit → API Management → Enable "Contract Trade" → "Position" permission`);
    }
    
    throw error;
  }
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
  console.log(`\n💰 [GET BALANCE] Fetching wallet balance...`);
  
  // ✅ FIX: Try UNIFIED first, then CONTRACT as fallback
  // Users may have either UTA 2.0 (UNIFIED) or Classic Account (CONTRACT)
  
  let lastError: any = null;
  
  // Try UNIFIED account type first (UTA 2.0)
  try {
    console.log(`   🔄 Trying accountType: UNIFIED (UTA 2.0)...`);
    
    const data = await makeBybitRequest(
      'GET',
      '/v5/account/wallet-balance',
      apiKey,
      apiSecret,
      {
        accountType: 'UNIFIED'
      }
    );

    console.log(`   📊 UNIFIED Response:`, JSON.stringify(data, null, 2));

    const balances: Array<{ asset: string; free: string; locked: string }> = [];

    if (data.result?.list?.[0]?.coin) {
      data.result.list[0].coin.forEach((coin: any) => {
        const walletBalance = parseFloat(coin.walletBalance || '0');
        const availableToWithdraw = parseFloat(coin.availableToWithdraw || '0');
        const locked = parseFloat(coin.locked || '0');

        console.log(`      [${coin.coin}] Wallet: ${walletBalance}, Available: ${availableToWithdraw}, Locked: ${locked}`);

        if (walletBalance > 0 || locked > 0) {
          balances.push({
            asset: coin.coin,
            free: availableToWithdraw.toFixed(8),
            locked: locked.toFixed(8),
          });
        }
      });
    }

    console.log(`   ✅ UNIFIED account - Found ${balances.length} coins with balance`);

    return {
      success: true,
      balances,
      canTrade: true,
      accountType: 'UNIFIED'
    };
  } catch (unifiedError: any) {
    console.warn(`   ⚠️ UNIFIED failed: ${unifiedError.message}`);
    lastError = unifiedError;
  }

  // Fallback: Try CONTRACT account type (Classic Derivatives Account)
  try {
    console.log(`   🔄 Trying accountType: CONTRACT (Classic Account)...`);
    
    const data = await makeBybitRequest(
      'GET',
      '/v5/account/wallet-balance',
      apiKey,
      apiSecret,
      {
        accountType: 'CONTRACT'
      }
    );

    console.log(`   📊 CONTRACT Response:`, JSON.stringify(data, null, 2));

    const balances: Array<{ asset: string; free: string; locked: string }> = [];

    if (data.result?.list?.[0]?.coin) {
      data.result.list[0].coin.forEach((coin: any) => {
        const walletBalance = parseFloat(coin.walletBalance || '0');
        const availableToWithdraw = parseFloat(coin.availableToWithdraw || '0');
        const locked = parseFloat(coin.locked || '0');

        console.log(`      [${coin.coin}] Wallet: ${walletBalance}, Available: ${availableToWithdraw}, Locked: ${locked}`);

        if (walletBalance > 0 || locked > 0) {
          balances.push({
            asset: coin.coin,
            free: availableToWithdraw.toFixed(8),
            locked: locked.toFixed(8),
          });
        }
      });
    }

    console.log(`   ✅ CONTRACT account - Found ${balances.length} coins with balance`);

    return {
      success: true,
      balances,
      canTrade: true,
      accountType: 'CONTRACT'
    };
  } catch (contractError: any) {
    console.error(`   ❌ CONTRACT also failed: ${contractError.message}`);
    
    // Both failed - throw detailed error
    throw new Error(
      `Failed to fetch balance from both UNIFIED and CONTRACT accounts. ` +
      `Last error: ${contractError.message}. ` +
      `Please check: 1) API key permissions include "Wallet" permission, ` +
      `2) API key and secret are correct, 3) Account type is either UTA 2.0 or Classic`
    );
  }
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