import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions, botLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

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
// 🚀 OKX POSITION OPENING (SIMPLIFIED & FIXED)
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
  alertId?: number
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
  console.log(`   Demo: ${demo}`);
  
  // ✅ Convert symbol to OKX format
  const okxSymbol = convertSymbolToOkx(symbol);
  
  // ============================================
  // 🔍 STEP 1: TEST CREDENTIALS WITH BALANCE CHECK
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
  // 🔍 STEP 2: GET INSTRUMENT INFO
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
      ctValCcy: instrumentInfo.ctValCcy,
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
  // 🔢 STEP 3: CALCULATE QUANTITY (SIMPLIFIED)
  // ============================================
  console.log(`\n🔢 Calculating order quantity...`);
  const ctVal = parseFloat(instrumentInfo.ctVal);
  const ctValCcy = instrumentInfo.ctValCcy;
  const lotSz = parseFloat(instrumentInfo.lotSz);
  const minSz = parseFloat(instrumentInfo.minSz);
  const tickSz = parseFloat(instrumentInfo.tickSz);
  
  // CRITICAL FIX: For USDT-margined perpetuals (e.g., ETH-USDT-SWAP):
  // - ctVal = contract value in base currency (e.g., 0.01 ETH)
  // - ctValCcy = base currency (e.g., ETH)
  // - To calculate sz (number of contracts):
  //   sz = (Position Size USD / Entry Price) / ctVal
  
  let contracts: number;
  const coinAmount = positionSizeUsd / entryPrice; // Amount of base currency needed
  contracts = coinAmount / ctVal; // Number of contracts
  
  // Round to lot size
  const roundedContracts = Math.floor(contracts / lotSz) * lotSz;
  const finalContracts = Math.max(roundedContracts, minSz);
  
  console.log(`   Position Size USD: $${positionSizeUsd}`);
  console.log(`   Entry Price: ${entryPrice}`);
  console.log(`   Coin Amount Needed: ${coinAmount.toFixed(8)} ${ctValCcy}`);
  console.log(`   Contract Value: ${ctVal} ${ctValCcy}`);
  console.log(`   Raw Contracts: ${contracts.toFixed(4)}`);
  console.log(`   Rounded (lotSz ${lotSz}): ${roundedContracts.toFixed(4)}`);
  console.log(`   Final (min ${minSz}): ${finalContracts.toFixed(4)}`);
  
  if (finalContracts < minSz) {
    throw new Error(`Calculated ${finalContracts} contracts is below minimum ${minSz} for ${okxSymbol}`);
  }
  
  const quantity = finalContracts.toString();
  
  // ============================================
  // 📏 STEP 4: SET LEVERAGE
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
      // Leverage errors are often non-critical (already set), log as warning
      console.warn(`⚠️ Leverage response (code ${leverageData.code}): ${leverageData.msg}`);
      await logToBot('warning', 'leverage_warning', `Leverage: ${leverageData.msg}`, { leverageData }, alertId);
    } else {
      console.log(`✅ Leverage set: ${leverage}x`);
    }
  } catch (error: any) {
    console.error(`❌ Leverage failed:`, error.message);
    await logToBot('error', 'leverage_failed', `Leverage failed: ${error.message}`, { error: error.message }, alertId);
    // Don't throw - continue with order placement
  }

  // ============================================
  // 📈 STEP 5: PLACE ORDER WITH SL/TP
  // ============================================
  console.log(`\n📈 Placing market order...`);
  
  // Format prices with correct precision
  const formatPrice = (price: number) => {
    const decimals = tickSz.toString().includes('.') 
      ? tickSz.toString().split('.')[1].length 
      : 0;
    return price.toFixed(decimals);
  };
  
  const orderPayload: any = {
    instId: okxSymbol,
    tdMode: 'cross',
    side: side.toLowerCase(), // 'buy' or 'sell'
    ordType: 'market',
    sz: quantity,
  };

  // ✅ CRITICAL FIX: Use attachAlgoOrds array instead of direct SL/TP
  if (slPrice || tpPrice) {
    const algoOrd: any = {
      attachAlgoClOrdId: `a${Date.now()}${Math.random().toString(36).substring(2, 8)}`,
    };

    if (tpPrice) {
      algoOrd.tpTriggerPx = formatPrice(tpPrice);
      algoOrd.tpOrdPx = '-1'; // Market price when triggered
      console.log(`🎯 Take Profit: ${algoOrd.tpTriggerPx}`);
    }

    if (slPrice) {
      algoOrd.slTriggerPx = formatPrice(slPrice);
      algoOrd.slOrdPx = '-1'; // Market price when triggered
      console.log(`🛑 Stop Loss: ${algoOrd.slTriggerPx}`);
    }

    orderPayload.attachAlgoOrds = [algoOrd];
  }

  console.log(`\n📤 ORDER PAYLOAD:`);
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
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ POSITION OPENED SUCCESSFULLY`);
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Symbol: ${okxSymbol}`);
  console.log(`   Side: ${side}`);
  console.log(`   Quantity: ${quantity} contracts`);
  console.log(`${'='.repeat(60)}\n`);

  await logToBot('success', 'position_opened', `OKX position opened: ${okxSymbol} ${side} ${leverage}x`, { 
    orderId, 
    symbol: okxSymbol, 
    side, 
    leverage, 
    quantity,
    positionSizeUsd,
    sl: slPrice, 
    tp: tpPrice
  }, alertId);

  return { orderId, quantity: finalContracts, okxSymbol };
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

    // Normalize symbol (remove .P suffix)
    const originalSymbol = data.symbol;
    const normalizedSymbol = data.symbol.replace(/\.P$/, '');
    data.symbol = normalizedSymbol;
    console.log(`🔧 Symbol: ${originalSymbol} → ${normalizedSymbol}`);

    // Validate required fields
    const requiredFields = ["symbol", "side", "tier", "entryPrice"];
    for (const field of requiredFields) {
      if (!(field in data)) {
        await logToBot('error', 'validation_failed', `Missing field: ${field}`, { field, data });
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
      }
    }

    // Calculate latency
    const receivedAt = Date.now();
    const alertTimestamp = data.timestamp || data.tvTs || Math.floor(receivedAt / 1000);
    const latency = Math.max(0, receivedAt - (alertTimestamp * 1000));

    // Idempotency check
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

    // Save alert to database
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
      createdAt: new Date().toISOString(),
    }).returning();

    console.log("✅ Alert saved:", alert.id);
    await logToBot('info', 'alert_received', `Alert received: ${data.symbol} ${data.side} ${data.tier}`, { symbol: data.symbol, side: data.side, tier: data.tier }, alert.id);

    // ============================================
    // 🤖 BOT TRADING LOGIC
    // ============================================

    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'no_bot_settings' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'Bot settings not configured', { reason: 'no_bot_settings' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, bot settings missing" });
    }

    const botConfig = settings[0];

    // Check API credentials
    if (!botConfig.apiKey || !botConfig.apiSecret || !botConfig.passphrase) {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'no_api_credentials' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'OKX API credentials incomplete', { reason: 'no_api_credentials' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, OKX credentials incomplete" });
    }

    const apiKey = botConfig.apiKey;
    const apiSecret = botConfig.apiSecret;
    const passphrase = botConfig.passphrase;
    const environment = botConfig.environment || "demo";
    const exchange = botConfig.exchange || "okx";

    console.log(`🔑 Using ${exchange.toUpperCase()} (${environment}) - API Key: ${apiKey.substring(0, 8)}...`);

    // CRITICAL: Only support OKX
    if (exchange !== "okx") {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'unsupported_exchange' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', `Unsupported exchange: ${exchange}. This webhook only supports OKX.`, { exchange }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: `Exchange ${exchange} not supported. Use OKX only.` });
    }

    // Check if bot enabled
    if (!botConfig.botEnabled) {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'bot_disabled' }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', 'Bot is disabled', { reason: 'bot_disabled' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Bot is disabled" });
    }

    // Tier filtering
    const disabledTiers = JSON.parse(botConfig.disabledTiers || '[]');
    if (disabledTiers.includes(data.tier)) {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'tier_disabled' }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', `Tier ${data.tier} disabled`, { tier: data.tier }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: `Tier ${data.tier} disabled` });
    }

    // Check for existing positions
    const existingPositions = await db.select().from(botPositions).where(and(
      eq(botPositions.symbol, data.symbol),
      eq(botPositions.status, "open")
    ));

    if (existingPositions.length > 0) {
      const existingPosition = existingPositions[0];

      if (botConfig.sameSymbolBehavior === "ignore") {
        await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'same_symbol_exists' }).where(eq(alerts.id, alert.id));
        await logToBot('info', 'rejected', `Position exists on ${data.symbol}`, { reason: 'same_symbol_exists' }, alert.id, existingPosition.id);
        return NextResponse.json({ success: true, alert_id: alert.id, message: "Same symbol position exists" });
      }

      const isOpposite = 
        (existingPosition.side === "BUY" && data.side === "SELL") ||
        (existingPosition.side === "SELL" && data.side === "BUY");

      if (isOpposite) {
        if (botConfig.oppositeDirectionStrategy === "market_reversal") {
          console.log(`🔄 Reversing position on ${data.symbol}`);
          await logToBot('info', 'reversal_attempt', `Reversing ${data.symbol}`, { existingPosition: existingPosition.side, newPosition: data.side }, alert.id, existingPosition.id);

          try {
            const closeOrderId = await closeOkxPosition(
              convertSymbolToOkx(data.symbol),
              existingPosition.side,
              existingPosition.quantity,
              apiKey,
              apiSecret,
              passphrase,
              environment === "demo",
              alert.id,
              existingPosition.id
            );

            await db.update(botPositions).set({ 
              status: "closed",
              closeReason: "opposite_signal",
              closedAt: new Date().toISOString(),
            }).where(eq(botPositions.id, existingPosition.id));

            await db.insert(botActions).values({
              actionType: "position_closed",
              symbol: data.symbol,
              side: existingPosition.side,
              tier: existingPosition.tier,
              positionId: existingPosition.id,
              reason: "opposite_signal",
              details: JSON.stringify({ closeOrderId }),
              success: true,
              createdAt: new Date().toISOString(),
            });

            console.log("✅ Opposite position closed, proceeding with new trade");
          } catch (error: any) {
            await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'failed_close_opposite' }).where(eq(alerts.id, alert.id));
            await logToBot('error', 'close_failed', `Failed to close opposite: ${error.message}`, { error: error.message }, alert.id, existingPosition.id);
            return NextResponse.json({ success: true, alert_id: alert.id, error: "Failed to close opposite position" });
          }
        } else {
          await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'opposite_ignored' }).where(eq(alerts.id, alert.id));
          await logToBot('info', 'rejected', 'Opposite direction ignored', { reason: 'opposite_ignored' }, alert.id, existingPosition.id);
          return NextResponse.json({ success: true, alert_id: alert.id, message: "Opposite direction ignored" });
        }
      } else {
        if (botConfig.sameSymbolBehavior === "track_confirmations") {
          await db.update(botPositions).set({ 
            confirmationCount: existingPosition.confirmationCount + 1,
            lastUpdated: new Date().toISOString(),
          }).where(eq(botPositions.id, existingPosition.id));
          
          await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));
          await logToBot('info', 'confirmation_tracked', `Confirmation tracked for ${data.symbol}`, { count: existingPosition.confirmationCount + 1 }, alert.id, existingPosition.id);
          return NextResponse.json({ success: true, alert_id: alert.id, message: "Confirmation tracked" });
        }
      }
    }

    // ============================================
    // 🎯 CALCULATE SL/TP
    // ============================================

    const entryPrice = parseFloat(data.entryPrice);
    let slPrice: number | null = null;
    let tp1Price: number | null = null;

    const hasSlTpInAlert = data.sl && data.tp3; // ✅ ZMIENIONE: Sprawdzamy tp3 zamiast tp1

    if (hasSlTpInAlert) {
      slPrice = parseFloat(data.sl);
      tp1Price = parseFloat(data.tp3); // ✅ ZMIENIONE: Używamy TP3 z alertu jako główny TP na giełdzie
      console.log("✅ Using SL/TP from alert (TP3 → TP1 for better RR)");
      await logToBot('info', 'tp_strategy', `Using TP3 from alert as TP1 for better Risk:Reward - Alert TP3: ${tp1Price}`, { 
        entryPrice, 
        slPrice, 
        tp1Price, 
        alertTp1: data.tp1, 
        alertTp2: data.tp2, 
        alertTp3: data.tp3 
      }, alert.id);
    } else if (botConfig.useDefaultSlTp) {
      const slPercent = botConfig.defaultSlPercent / 100;
      const tp1Percent = botConfig.defaultTp1Percent / 100;

      if (data.side === "BUY") {
        slPrice = entryPrice * (1 - slPercent);
        tp1Price = entryPrice * (1 + tp1Percent);
      } else {
        slPrice = entryPrice * (1 + slPercent);
        tp1Price = entryPrice * (1 - tp1Percent);
      }
      console.log(`🛡️ Using default SL/TP: SL=${slPrice}, TP1=${tp1Price}`);
    } else {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'no_sl_tp' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'No SL/TP provided', { reason: 'no_sl_tp' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "No SL/TP provided" });
    }

    // ✅ CRITICAL FIX: Validate TP/SL direction
    const isBuy = data.side === "BUY";
    if (slPrice && tp1Price) {
      if (isBuy) {
        // BUY: TP must be > entry, SL must be < entry
        // ⚠️ IMPORTANT: Add safety margin because OKX validates against CURRENT market price, not alert entry price
        const minTpPrice = entryPrice * 1.015; // +1.5% minimum
        const maxSlPrice = entryPrice * 0.985; // -1.5% maximum
        
        if (tp1Price < minTpPrice) {
          console.warn(`⚠️ TP ${tp1Price} too close to entry ${entryPrice} for BUY, adjusting to ${minTpPrice}...`);
          tp1Price = minTpPrice;
        }
        if (slPrice > maxSlPrice) {
          console.warn(`⚠️ SL ${slPrice} too close to entry ${entryPrice} for BUY, adjusting to ${maxSlPrice}...`);
          slPrice = maxSlPrice;
        }
      } else {
        // SELL: TP must be < entry, SL must be > entry
        const maxTpPrice = entryPrice * 0.985; // -1.5% minimum
        const minSlPrice = entryPrice * 1.015; // +1.5% maximum
        
        if (tp1Price > maxTpPrice) {
          console.warn(`⚠️ TP ${tp1Price} too close to entry ${entryPrice} for SELL, adjusting to ${maxTpPrice}...`);
          tp1Price = maxTpPrice;
        }
        if (slPrice < minSlPrice) {
          console.warn(`⚠️ SL ${slPrice} too close to entry ${entryPrice} for SELL, adjusting to ${minSlPrice}...`);
          slPrice = minSlPrice;
        }
      }
      console.log(`🎯 Validated TP/SL - Side: ${data.side}, Entry: ${entryPrice}, TP: ${tp1Price}, SL: ${slPrice}`);
    }

    // ============================================
    // 💰 CALCULATE POSITION SIZE
    // ============================================

    let positionSizeUsd = botConfig.positionSizeFixed;
    const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;

    console.log(`💰 Position: $${positionSizeUsd}, Leverage: ${leverage}x`);

    // ============================================
    // 🚀 OPEN POSITION ON OKX
    // ============================================

    try {
      const symbol = data.symbol;
      const side = data.side;

      await logToBot('info', 'opening_position', `Opening ${symbol} ${side} ${leverage}x on OKX`, { 
        symbol, 
        side, 
        leverage, 
        positionSizeUsd,
        environment 
      }, alert.id);

      const { orderId, quantity: finalQuantity, okxSymbol } = await openOkxPosition(
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
        alert.id
      );

      // Save position to database
      const [botPosition] = await db.insert(botPositions).values({
        symbol: data.symbol,
        side: data.side,
        entryPrice,
        quantity: finalQuantity,
        leverage,
        stopLoss: slPrice || 0,
        tp1Price,
        tp2Price: data.tp2 ? parseFloat(data.tp2) : null,
        tp3Price: data.tp3 ? parseFloat(data.tp3) : null,
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

      await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));

      await db.insert(botActions).values({
        actionType: "position_opened",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        positionId: botPosition.id,
        reason: "new_signal",
        details: JSON.stringify({ orderId, exchange: "okx", environment }),
        success: true,
        createdAt: new Date().toISOString(),
      });

      // ============================================
      // 🎯 ADD TP2 AND TP3 IF PROVIDED (OKX Limitation Workaround)
      // ============================================
      // NOTE: OKX only allows 1 TP + 1 SL in attachAlgoOrds
      // For multiple TPs, we need to manually monitor and close positions
      // This is logged for future implementation
      if (data.tp2 || data.tp3) {
        const tp2 = data.tp2 ? parseFloat(data.tp2) : null;
        const tp3 = data.tp3 ? parseFloat(data.tp3) : null;
        
        await logToBot('info', 'multiple_tp_detected', `Alert contains multiple TPs: TP1=${tp1Price}, TP2=${tp2}, TP3=${tp3}. Saved to DB for manual monitoring.`, {
          symbol,
          tp1: tp1Price,
          tp2,
          tp3,
          note: "OKX API limitation: Only 1 TP per order. TP2/TP3 require separate monitoring system."
        }, alert.id, botPosition.id);
      }

      await logToBot('success', 'position_opened', `✅ Position opened: ${symbol} ${side} ${leverage}x on OKX`, {
        positionId: botPosition.id,
        orderId,
        symbol,
        side,
        leverage,
        quantity: finalQuantity,
        entryPrice,
        sl: slPrice,
        tp: tp1Price,
        environment
      }, alert.id, botPosition.id);

      return NextResponse.json({
        success: true,
        alert_id: alert.id,
        position_id: botPosition.id,
        message: "Position opened successfully on OKX",
        exchange: "okx",
        environment,
        position: { symbol: okxSymbol, side, entry: entryPrice, quantity: finalQuantity, sl: slPrice, tp: tp1Price }
      });
    } catch (error: any) {
      console.error("❌ Position opening failed:", error);

      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'exchange_error' }).where(eq(alerts.id, alert.id));

      await db.insert(botActions).values({
        actionType: "position_failed",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "exchange_error",
        details: JSON.stringify({ error: error.message, exchange: "okx" }),
        success: false,
        errorMessage: error.message,
        createdAt: new Date().toISOString(),
      });

      await logToBot('error', 'position_failed', `❌ Position opening failed: ${error.message}`, { error: error.message, symbol: data.symbol }, alert.id);

      return NextResponse.json({ success: true, alert_id: alert.id, error: error.message, message: "Alert saved but position opening failed" });
    }
  } catch (error: any) {
    console.error("❌ Webhook error:", error);
    await logToBot('error', 'webhook_error', `Critical error: ${error.message}`, { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}