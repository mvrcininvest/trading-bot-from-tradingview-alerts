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
// 🚀 OKX POSITION OPENING
// ============================================

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

  // Step 2: Open position with SL/TP
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
    throw new Error(`OKX order failed (code ${orderData.code}): ${orderData.msg}`);
  }

  const orderId = orderData.data?.[0]?.ordId || 'unknown';
  console.log('✅ OKX position opened:', orderId);

  await logToBot('success', 'position_opened', `OKX position opened: ${symbol} ${side} ${leverage}x`, { 
    orderId, 
    symbol, 
    side, 
    leverage, 
    quantity, 
    sl: slPrice, 
    tp: tp1Price 
  }, alertId);

  return orderId;
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
    throw new Error(`OKX close failed (code ${data.code}): ${data.msg}`);
  }

  const orderId = data.data?.[0]?.ordId || 'unknown';
  console.log('✅ OKX position closed:', orderId);

  await logToBot('success', 'position_closed', `OKX position closed: ${symbol}`, { orderId, symbol }, alertId, positionId);

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
      await logToBot('error', 'rejected', 'OKX API credentials incomplete (missing passphrase)', { reason: 'no_api_credentials' }, alert.id);
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

    const hasSlTpInAlert = data.sl && data.tp1;

    if (hasSlTpInAlert) {
      slPrice = parseFloat(data.sl);
      tp1Price = parseFloat(data.tp1);
      console.log("✅ Using SL/TP from alert");
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

    // ============================================
    // 💰 CALCULATE POSITION SIZE
    // ============================================

    let positionSizeUsd = botConfig.positionSizeFixed;
    const quantity = positionSizeUsd / entryPrice;
    const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;

    console.log(`💰 Position: $${positionSizeUsd}, Qty: ${quantity}, Leverage: ${leverage}x`);

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
        quantity, 
        environment 
      }, alert.id);

      const orderId = await openOkxPosition(
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

      // Save position to database
      const [botPosition] = await db.insert(botPositions).values({
        symbol: data.symbol,
        side: data.side,
        entryPrice,
        quantity,
        leverage,
        stopLoss: slPrice || 0,
        tp1Price,
        tp2Price: null,
        tp3Price: null,
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

      await logToBot('success', 'position_opened', `✅ Position opened: ${symbol} ${side} ${leverage}x on OKX`, {
        positionId: botPosition.id,
        orderId,
        symbol,
        side,
        leverage,
        quantity,
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
