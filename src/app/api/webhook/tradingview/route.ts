import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions, botLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

// ============================================
// 🔐 SIGNATURE HELPERS
// ============================================

function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  payloadString: string
): string {
  const paramString = timestamp + apiKey + "5000" + payloadString;
  return crypto.createHmac("sha256", apiSecret).update(paramString).digest("hex");
}

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
// 🏦 EXCHANGE API HELPERS
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

  console.log(`🔑 OKX ${method} ${endpoint}`, { timestamp, demo, bodyPreview: bodyString.substring(0, 100) });

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

async function makeBybitRequest(
  url: string,
  apiKey: string,
  apiSecret: string,
  payload: any,
  alertId?: number
) {
  const timestamp = Date.now();
  const payloadString = JSON.stringify(payload);
  const signature = createBybitSignature(apiKey, apiSecret, timestamp, payloadString);

  console.log(`🔑 Bybit POST ${url}`, { timestamp, payload: payloadString.substring(0, 100) });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp.toString(),
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": "5000"
    },
    body: payloadString
  });

  const responseText = await response.text();
  console.log(`📥 Bybit Response (${response.status}):`, responseText.substring(0, 500));

  if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
    await logToBot('error', 'bybit_html_response', 'Bybit API returned HTML (CloudFlare/WAF block)', { 
      status: response.status,
      url,
      apiKeyPreview: apiKey.substring(0, 8) + '...',
      responsePreview: responseText.substring(0, 300)
    }, alertId);
    throw new Error('Bybit CloudFlare/WAF block - użyj Testnet zamiast Demo');
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    await logToBot('error', 'bybit_parse_error', `Bybit returned non-JSON: ${responseText.substring(0, 200)}`, { responseText: responseText.substring(0, 500) }, alertId);
    throw new Error(`Bybit API returned invalid JSON: ${responseText.substring(0, 200)}`);
  }

  return { response, data };
}

function getBybitBaseUrl(environment: string): string {
  if (environment === "demo") return "https://api-demo.bybit.com";
  if (environment === "testnet") return "https://api-testnet.bybit.com";
  return "https://api.bybit.com";
}

// ============================================
// 🎯 EXCHANGE-SPECIFIC POSITION HANDLERS
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
    sz: quantity.toFixed(4),
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
    throw new Error(`OKX close failed: ${data.msg}`);
  }

  const orderId = data.data?.[0]?.ordId || 'unknown';
  console.log('✅ OKX position closed:', orderId);

  await logToBot('success', 'position_closed', `OKX position closed: ${symbol}`, { orderId, symbol }, alertId, positionId);

  return orderId;
}

async function closeBybitPosition(
  symbol: string,
  positionSide: string,
  quantity: number,
  apiKey: string,
  apiSecret: string,
  environment: string,
  alertId?: number,
  positionId?: number
) {
  console.log(`🔄 Closing Bybit position: ${symbol} ${positionSide} qty=${quantity}`);

  const baseUrl = getBybitBaseUrl(environment);

  const closePayload = {
    category: "linear",
    symbol,
    side: positionSide === "BUY" ? "Sell" : "Buy",
    orderType: "Market",
    qty: quantity.toString(),
    timeInForce: "GTC",
    reduceOnly: true,
    closeOnTrigger: false
  };

  const { data } = await makeBybitRequest(
    `${baseUrl}/v5/order/create`,
    apiKey,
    apiSecret,
    closePayload,
    alertId
  );

  if (data.retCode !== 0) {
    throw new Error(`Bybit close failed: ${data.retMsg}`);
  }

  const orderId = data.result?.orderId || 'unknown';
  console.log('✅ Bybit position closed:', orderId);

  await logToBot('success', 'position_closed', `Bybit position closed: ${symbol}`, { orderId, symbol }, alertId, positionId);

  return orderId;
}

async function openOkxPosition(
  symbol: string,
  side: string,
  quantity: number,
  leverage: number,
  slPrice: number | null,
  tp1Price: number | null,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  alertId?: number
) {
  console.log(`🚀 Opening OKX position: ${symbol} ${side} ${leverage}x qty=${quantity}`);

  // Step 1: Set leverage
  try {
    const { data: leverageData } = await makeOkxRequest(
      'POST',
      '/api/v5/account/set-leverage',
      apiKey,
      apiSecret,
      passphrase,
      demo,
      {
        instId: symbol,
        lever: leverage.toString(),
        mgnMode: 'cross'
      },
      alertId
    );

    if (leverageData.code !== '0') {
      console.warn('⚠️ OKX leverage warning:', leverageData.msg);
      await logToBot('warning', 'leverage_warning', `OKX leverage: ${leverageData.msg}`, { leverageData }, alertId);
    } else {
      console.log(`✅ OKX leverage set: ${leverage}x`);
    }
  } catch (leverageError: any) {
    console.warn('⚠️ OKX leverage failed:', leverageError.message);
    await logToBot('warning', 'leverage_failed', `OKX leverage failed: ${leverageError.message}`, { error: leverageError.message }, alertId);
  }

  // Step 2: Open position
  const orderPayload: any = {
    instId: symbol,
    tdMode: 'cross',
    side: side.toLowerCase(),
    ordType: 'market',
    sz: quantity.toFixed(4),
  };

  if (slPrice) {
    orderPayload.slTriggerPx = slPrice.toFixed(2);
    orderPayload.slOrdPx = '-1';
  }

  if (tp1Price) {
    orderPayload.tpTriggerPx = tp1Price.toFixed(2);
    orderPayload.tpOrdPx = '-1';
  }

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

  if (orderData.code !== '0') {
    throw new Error(`OKX order failed: ${orderData.msg}`);
  }

  const orderId = orderData.data?.[0]?.ordId || 'unknown';
  console.log('✅ OKX position opened:', orderId);

  await logToBot('success', 'position_opened', `OKX position opened: ${symbol} ${side} ${leverage}x`, { orderId, symbol, side, leverage, quantity, sl: slPrice, tp: tp1Price }, alertId);

  return orderId;
}

async function openBybitPosition(
  symbol: string,
  side: string,
  quantity: number,
  leverage: number,
  slPrice: number | null,
  tp1Price: number | null,
  apiKey: string,
  apiSecret: string,
  environment: string,
  tpMode: string,
  alertId?: number
) {
  console.log(`🚀 Opening Bybit position: ${symbol} ${side} ${leverage}x qty=${quantity}`);

  const baseUrl = getBybitBaseUrl(environment);

  // Step 1: Set leverage
  try {
    const { data: leverageData } = await makeBybitRequest(
      `${baseUrl}/v5/position/set-leverage`,
      apiKey,
      apiSecret,
      {
        category: "linear",
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      },
      alertId
    );

    if (leverageData.retCode === 0 || leverageData.retCode === 110043) {
      console.log(`✅ Bybit leverage set: ${leverage}x`);
    } else {
      console.warn(`⚠️ Bybit leverage warning (${leverageData.retCode}):`, leverageData.retMsg);
      await logToBot('warning', 'leverage_warning', `Bybit leverage: ${leverageData.retMsg}`, { retCode: leverageData.retCode }, alertId);
    }
  } catch (leverageError: any) {
    console.warn('⚠️ Bybit leverage failed:', leverageError.message);
    await logToBot('warning', 'leverage_failed', `Bybit leverage failed: ${leverageError.message}`, { error: leverageError.message }, alertId);
  }

  // Step 2: Open position
  const { data: orderData } = await makeBybitRequest(
    `${baseUrl}/v5/order/create`,
    apiKey,
    apiSecret,
    {
      category: "linear",
      symbol,
      side: side === "BUY" ? "Buy" : "Sell",
      orderType: "Market",
      qty: quantity.toFixed(4),
      timeInForce: "GTC"
    },
    alertId
  );

  if (orderData.retCode !== 0) {
    throw new Error(`Bybit order failed: ${orderData.retMsg}`);
  }

  const orderId = orderData.result?.orderId || 'unknown';
  console.log('✅ Bybit position opened:', orderId);

  // Step 3: Set SL/TP
  if (slPrice || tp1Price) {
    await new Promise(resolve => setTimeout(resolve, 500));

    const tpslParams: any = {
      category: "linear",
      symbol,
      positionIdx: 0
    };

    if (slPrice) tpslParams.stopLoss = slPrice.toFixed(2);
    if (tp1Price) tpslParams.takeProfit = tp1Price.toFixed(2);

    try {
      const { data: tpslData } = await makeBybitRequest(
        `${baseUrl}/v5/position/trading-stop`,
        apiKey,
        apiSecret,
        tpslParams,
        alertId
      );

      if (tpslData.retCode !== 0) {
        console.warn("⚠️ Bybit SL/TP warning:", tpslData.retMsg);
        await logToBot('warning', 'sl_tp_warning', `Bybit SL/TP: ${tpslData.retMsg}`, { retCode: tpslData.retCode }, alertId);
      }
    } catch (tpslError: any) {
      console.warn("⚠️ Bybit SL/TP failed:", tpslError.message);
    }
  }

  await logToBot('success', 'position_opened', `Bybit position opened: ${symbol} ${side} ${leverage}x`, { orderId, symbol, side, leverage, quantity, sl: slPrice, tp: tp1Price }, alertId);

  return orderId;
}

// ============================================
// 🌐 GET ENDPOINT (TEST)
// ============================================

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  
  await logToBot('info', 'webhook_test', 'Webhook endpoint tested via GET', { timestamp, url: request.url });
  
  return NextResponse.json({ 
    status: 'online',
    message: 'TradingView Webhook Endpoint is working!',
    timestamp,
    endpoint: '/api/webhook/tradingview',
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
    if (!botConfig.apiKey || !botConfig.apiSecret) {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'no_api_credentials' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'API credentials not configured', { reason: 'no_api_credentials' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, API credentials missing" });
    }

    const apiKey = botConfig.apiKey;
    const apiSecret = botConfig.apiSecret;
    const passphrase = botConfig.passphrase || '';
    const environment = botConfig.environment || "demo";
    const exchange = botConfig.exchange || "okx";

    console.log(`🔑 Using ${exchange.toUpperCase()} (${environment}) - API Key: ${apiKey.substring(0, 8)}...`);

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
            let closeOrderId: string;

            if (exchange === "okx") {
              closeOrderId = await closeOkxPosition(
                data.symbol,
                existingPosition.side,
                existingPosition.quantity,
                apiKey,
                apiSecret,
                passphrase,
                environment === "demo",
                alert.id,
                existingPosition.id
              );
            } else {
              closeOrderId = await closeBybitPosition(
                data.symbol,
                existingPosition.side,
                existingPosition.quantity,
                apiKey,
                apiSecret,
                environment,
                alert.id,
                existingPosition.id
              );
            }

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
    let tp2Price: number | null = null;
    let tp3Price: number | null = null;

    const hasSlTpInAlert = data.sl && data.tp1;

    if (hasSlTpInAlert) {
      slPrice = parseFloat(data.sl);
      tp1Price = parseFloat(data.tp1);
      tp2Price = data.tp2 ? parseFloat(data.tp2) : null;
      tp3Price = data.tp3 ? parseFloat(data.tp3) : null;
      console.log("✅ Using SL/TP from alert");
    } else if (botConfig.useDefaultSlTp) {
      const slPercent = botConfig.defaultSlPercent / 100;
      const tp1Percent = botConfig.defaultTp1Percent / 100;
      const tp2Percent = botConfig.defaultTp2Percent / 100;
      const tp3Percent = botConfig.defaultTp3Percent / 100;

      if (data.side === "BUY") {
        slPrice = entryPrice * (1 - slPercent);
        tp1Price = entryPrice * (1 + tp1Percent);
        tp2Price = entryPrice * (1 + tp2Percent);
        tp3Price = entryPrice * (1 + tp3Percent);
      } else {
        slPrice = entryPrice * (1 + slPercent);
        tp1Price = entryPrice * (1 - tp1Percent);
        tp2Price = entryPrice * (1 - tp2Percent);
        tp3Price = entryPrice * (1 - tp3Percent);
      }
      console.log(`🛡️ Using default SL/TP: SL=${slPrice}, TP1=${tp1Price}`);
    } else {
      await db.update(alerts).set({ executionStatus: 'rejected', rejectionReason: 'no_sl_tp' }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'No SL/TP provided', { reason: 'no_sl_tp' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "No SL/TP provided" });
    }

    // ============================================
    // 💰 CALCULATE POSITION SIZE
    // ============================================

    let positionSizeUsd = botConfig.positionSizeFixed;
    const quantity = positionSizeUsd / entryPrice;
    const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;

    console.log(`💰 Position: $${positionSizeUsd}, Qty: ${quantity}, Leverage: ${leverage}x`);

    // ============================================
    // 🚀 OPEN POSITION
    // ============================================

    try {
      const symbol = data.symbol;
      const side = data.side;
      const tpMode = botConfig.tpStrategy || "main_only";

      await logToBot('info', 'opening_position', `Opening ${symbol} ${side} ${leverage}x on ${exchange.toUpperCase()}`, { symbol, side, leverage, quantity, exchange, environment }, alert.id);

      let orderId: string;

      if (exchange === "okx") {
        orderId = await openOkxPosition(
          symbol,
          side,
          quantity,
          leverage,
          slPrice,
          tp1Price,
          apiKey,
          apiSecret,
          passphrase,
          environment === "demo",
          alert.id
        );
      } else {
        orderId = await openBybitPosition(
          symbol,
          side,
          quantity,
          leverage,
          slPrice,
          tp1Price,
          apiKey,
          apiSecret,
          environment,
          tpMode,
          alert.id
        );
      }

      // Save position to database
      const [botPosition] = await db.insert(botPositions).values({
        symbol: data.symbol,
        side: data.side,
        entryPrice,
        quantity,
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

      await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));

      await db.insert(botActions).values({
        actionType: "position_opened",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        positionId: botPosition.id,
        reason: "new_signal",
        details: JSON.stringify({ orderId, exchange, environment }),
        success: true,
        createdAt: new Date().toISOString(),
      });

      await logToBot('success', 'position_opened', `✅ Position opened: ${symbol} ${side} ${leverage}x on ${exchange.toUpperCase()}`, {
        positionId: botPosition.id,
        orderId,
        symbol,
        side,
        leverage,
        quantity,
        entryPrice,
        sl: slPrice,
        tp: tp1Price,
        exchange,
        environment
      }, alert.id, botPosition.id);

      return NextResponse.json({
        success: true,
        alert_id: alert.id,
        position_id: botPosition.id,
        message: "Position opened successfully",
        exchange,
        environment,
        position: { symbol, side, entry: entryPrice, quantity, sl: slPrice, tp: tp1Price }
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
        details: JSON.stringify({ error: error.message, exchange }),
        success: false,
        errorMessage: error.message,
        createdAt: new Date().toISOString(),
      });

      await logToBot('error', 'position_failed', `❌ Position opening failed: ${error.message}`, { error: error.message, symbol: data.symbol, exchange }, alert.id);

      return NextResponse.json({ success: true, alert_id: alert.id, error: error.message, message: "Alert saved but position opening failed" });
    }
  } catch (error: any) {
    console.error("❌ Webhook error:", error);
    await logToBot('error', 'webhook_error', `Critical error: ${error.message}`, { error: error.message, stack: error.stack });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}