import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions, botLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

// CRITICAL FIX: For POST requests, sign with the EXACT JSON string sent in body
function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  payloadString: string
): string {
  const paramString = timestamp + apiKey + "5000" + payloadString;
  return crypto.createHmac("sha256", apiSecret).update(paramString).digest("hex");
}

// Helper function to convert snake_case to camelCase
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

// Helper function to log to botLogs
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

// GET endpoint for testing webhook connectivity
export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  
  await logToBot(
    'info',
    'webhook_test',
    'Webhook endpoint tested via GET request',
    { timestamp, url: request.url }
  );
  
  return NextResponse.json({ 
    status: 'online',
    message: 'TradingView Webhook Endpoint is working!',
    timestamp,
    endpoint: '/api/webhook/tradingview',
    methods: ['GET (test)', 'POST (receive alerts)']
  });
}

function getBybitBaseUrl(environment: string): string {
  if (environment === "demo") return "https://api-demo.bybit.com";
  if (environment === "testnet") return "https://api-testnet.bybit.com";
  return "https://api.bybit.com";
}

// Helper function to make Bybit API calls with proper error handling
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

  console.log("🔑 Bybit Request:", {
    url,
    timestamp,
    payload: payloadString,
    apiKeyPreview: apiKey.substring(0, 8) + '...'
  });

  // CRITICAL: Add realistic browser headers to bypass CloudFlare/WAF
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-TIMESTAMP": timestamp.toString(),
      "X-BAPI-SIGN": signature,
      "X-BAPI-RECV-WINDOW": "5000",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Origin": "https://www.bybit.com",
      "Referer": "https://www.bybit.com/",
      "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site"
    },
    body: payloadString
  });

  const responseText = await response.text();
  console.log(`📥 Bybit Response (${response.status}):`, responseText.substring(0, 500));

  // Check if response is HTML (CloudFlare block or error)
  if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
    console.error("❌ Bybit returned HTML instead of JSON");
    
    await logToBot(
      'error',
      'bybit_html_response',
      'Bybit API returned HTML (CloudFlare/WAF block from server IP)',
      { 
        status: response.status,
        url,
        apiKeyPreview: apiKey.substring(0, 8) + '...',
        responsePreview: responseText.substring(0, 300),
        solution: 'Add Vercel server IP to Bybit API whitelist: Go to Bybit → API Management → Edit API → IP Restriction → Allow server IPs'
      },
      alertId
    );

    throw new Error(
      '🔒 Bybit CloudFlare/WAF blokuje serwer Vercel!\n\n' +
      '✅ ROZWIĄZANIE (wybierz jedno):\n\n' +
      '1. ⭐ NAJLEPSZE: Wyłącz IP Restriction w Bybit API:\n' +
      '   • Wejdź na Bybit → API Management\n' +
      '   • Edytuj swój API key\n' +
      '   • IP Restriction → "Unrestricted" (wszystkie IP)\n' +
      '   • Zapisz zmiany\n\n' +
      '2. Dodaj IP serwera Vercel do whitelisty:\n' +
      '   • Bybit → API Management → Edit API\n' +
      '   • IP Restriction → Dodaj: 76.76.21.0/24 (Vercel IPs)\n' +
      '   • Problem: Vercel używa wielu dynamicznych IP\n\n' +
      '3. Użyj Bybit Mainnet zamiast Demo:\n' +
      '   • Mainnet ma mniej restrykcji CloudFlare\n' +
      '   • Exchange Test → Mainnet environment\n\n' +
      `Obecne środowisko: ${process.env.BYBIT_ENVIRONMENT || 'not set'}`
    );
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error("❌ Failed to parse Bybit response:", responseText.substring(0, 500));
    throw new Error(`Invalid JSON response from Bybit: ${responseText.substring(0, 200)}`);
  }

  return { response, data };
}

export async function POST(request: Request) {
  try {
    // KROK 1: Sprawdź raw body dla debugowania
    const rawBody = await request.text();
    console.log("📨 RAW REQUEST BODY:", rawBody);
    
    // Spróbuj sparsować JSON
    let rawData;
    try {
      rawData = JSON.parse(rawBody);
      console.log("✅ JSON parsed successfully:", JSON.stringify(rawData, null, 2));
    } catch (parseError) {
      console.error("❌ JSON PARSE ERROR:", parseError);
      
      await logToBot(
        'error',
        'webhook_parse_error',
        'Failed to parse TradingView alert JSON',
        { 
          error: parseError instanceof Error ? parseError.message : String(parseError),
          rawBodyPreview: rawBody.substring(0, 500),
          contentType: request.headers.get('content-type')
        }
      );
      
      return NextResponse.json(
        { error: "Invalid JSON format", received: rawBody.substring(0, 200) },
        { status: 400 }
      );
    }

    // KROK 2: Normalize snake_case to camelCase
    const data = snakeToCamel(rawData);
    console.log("🔄 Normalized data:", JSON.stringify(data, null, 2));

    // KROK 2.5: NORMALIZE SYMBOL - Remove .P suffix for Bybit API
    const originalSymbol = data.symbol;
    const normalizedSymbol = data.symbol.replace(/\.P$/, '');
    data.symbol = normalizedSymbol;
    
    console.log(`🔧 Symbol normalization: ${originalSymbol} → ${normalizedSymbol}`);

    // KROK 3: Validate basic required fields (now in camelCase)
    const requiredFields = [
      "symbol",
      "side",
      "tier",
      "entryPrice",
    ];

    // Check basic required fields
    for (const field of requiredFields) {
      if (!(field in data)) {
        await logToBot('error', 'webhook_validation_failed', `Missing required field: ${field}`, { field, data });
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // KROK 3.5: OBLICZ LATENCJĘ
    const receivedAt = Date.now();
    const alertTimestamp = data.timestamp || data.tvTs || Math.floor(receivedAt / 1000);
    const latency = receivedAt - (alertTimestamp * 1000); // Convert to ms
    console.log(`⏱️ Latency calculated: ${latency}ms`);

    // KROK 3.6: IDEMPOTENCY CHECK - użyj timestamp + symbol jako unique key
    const idempotencyKey = `${data.symbol}_${data.side}_${data.tier}_${alertTimestamp}`;
    const idempotencyWindow = 60; // 60 sekund
    const recentTimestamp = alertTimestamp - idempotencyWindow;
    
    const duplicateCheck = await db.select()
      .from(alerts)
      .where(
        and(
          eq(alerts.symbol, data.symbol),
          eq(alerts.side, data.side),
          eq(alerts.tier, data.tier)
        )
      )
      .limit(10);
    
    // Sprawdź czy jest dokładnie ten sam timestamp (duplikat)
    const isDuplicate = duplicateCheck.some(alert => {
      const timeDiff = Math.abs(alert.timestamp - alertTimestamp);
      return timeDiff < 5; // Dokładnie ten sam alert (różnica < 5 sekund)
    });
    
    if (isDuplicate) {
      console.log("⚠️ Duplicate alert detected (same timestamp), ignoring");
      await logToBot(
        'warning',
        'duplicate_alert_ignored',
        `Duplicate alert ignored: ${data.symbol} ${data.side} ${data.tier}`,
        { symbol: data.symbol, side: data.side, tier: data.tier, timestamp: alertTimestamp }
      );
      
      return NextResponse.json({ 
        success: true, 
        message: "Duplicate alert ignored",
        duplicate: true
      });
    }

    // Save alert to database with pending status
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
      latency: Math.max(0, latency), // Obliczona latencja
      rawJson: JSON.stringify(data),
      executionStatus: 'pending',
      rejectionReason: null,
      createdAt: new Date().toISOString(),
    }).returning();

    console.log("✅ Alert saved to database:", alert.id);
    
    // LOG: Alert received and saved
    await logToBot(
      'info',
      'webhook_received',
      `✅ TradingView alert received: ${data.symbol} ${data.side} ${data.tier}`,
      { symbol: data.symbol, side: data.side, tier: data.tier, entryPrice: data.entryPrice },
      alert.id
    );

    // ============================================
    // 🤖 BOT LOGIC - Automatic Trading
    // ============================================

    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) {
      console.log("⚠️ No bot settings found, skipping trade");
      
      // Update alert status to rejected
      await db.update(alerts)
        .set({ 
          executionStatus: 'rejected',
          rejectionReason: 'bot_settings_not_configured'
        })
        .where(eq(alerts.id, alert.id));
      
      // LOG: Settings not found
      await logToBot(
        'error',
        'alert_rejected',
        'Bot settings not configured',
        { reason: 'bot_settings_not_configured' },
        alert.id
      );
      
      // Zwróć 200 aby TradingView nie retry
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "Alert saved, but bot settings not configured"
      });
    }

    const botConfig = settings[0];

    // CRITICAL: Check if API credentials are configured in database
    if (!botConfig.apiKey || !botConfig.apiSecret) {
      console.log("❌ API credentials not configured in database");
      
      await db.update(alerts)
        .set({ 
          executionStatus: 'rejected',
          rejectionReason: 'api_credentials_not_configured'
        })
        .where(eq(alerts.id, alert.id));
      
      await logToBot(
        'error',
        'alert_rejected',
        'API credentials not configured - please save your API keys in Exchange Test page',
        { reason: 'api_credentials_not_configured' },
        alert.id
      );
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "Alert saved, but API credentials not configured"
      });
    }

    // Use API credentials from database (NOT from .env)
    const apiKey = botConfig.apiKey;
    const apiSecret = botConfig.apiSecret;
    const environment = botConfig.environment || "demo";
    const exchange = botConfig.exchange || "bybit";

    console.log(`🔑 Using API credentials from database: ${exchange} (${environment})`);
    console.log(`🔑 API Key preview: ${apiKey.substring(0, 8)}...`);

    // Check if bot is enabled
    if (!botConfig.botEnabled) {
      console.log("🛑 Bot is disabled");
      
      // Update alert status to rejected
      await db.update(alerts)
        .set({ 
          executionStatus: 'rejected',
          rejectionReason: 'bot_disabled'
        })
        .where(eq(alerts.id, alert.id));
      
      // LOG: Bot disabled
      await logToBot(
        'warning',
        'alert_rejected',
        `Bot is disabled - alert ignored: ${data.symbol} ${data.side}`,
        { reason: 'bot_disabled', symbol: data.symbol, side: data.side },
        alert.id
      );
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "Alert saved, but bot is disabled"
      });
    }

    // Tier filtering
    const disabledTiers = JSON.parse(botConfig.disabledTiers || '[]');
    if (disabledTiers.includes(data.tier)) {
      console.log(`⚠️ Alert tier ${data.tier} is disabled`);
      
      // Update alert status to rejected
      await db.update(alerts)
        .set({ 
          executionStatus: 'rejected',
          rejectionReason: 'tier_disabled'
        })
        .where(eq(alerts.id, alert.id));
      
      await db.insert(botActions).values({
        actionType: "alert_filtered",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "tier_disabled",
        details: JSON.stringify({ tier: data.tier }),
        success: false,
        createdAt: new Date().toISOString(),
      });
      
      // LOG: Tier disabled
      await logToBot(
        'warning',
        'alert_rejected',
        `Tier ${data.tier} is disabled - alert ignored: ${data.symbol}`,
        { reason: 'tier_disabled', tier: data.tier, symbol: data.symbol },
        alert.id
      );
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: `Alert tier ${data.tier} is disabled`
      });
    }

    // Check for existing positions on same symbol
    const existingPositions = await db
      .select()
      .from(botPositions)
      .where(
        and(
          eq(botPositions.symbol, data.symbol),
          eq(botPositions.status, "open")
        )
      );

    // Same Symbol Logic
    if (existingPositions.length > 0) {
      const existingPosition = existingPositions[0];
      
      if (botConfig.sameSymbolBehavior === "ignore") {
        console.log(`⚠️ Position already exists on ${data.symbol}, ignoring`);
        
        // Update alert status to rejected
        await db.update(alerts)
          .set({ 
            executionStatus: 'rejected',
            rejectionReason: 'same_symbol_position_exists'
          })
          .where(eq(alerts.id, alert.id));
        
        await db.insert(botActions).values({
          actionType: "alert_ignored",
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          alertId: alert.id,
          reason: "same_symbol_ignore",
          details: JSON.stringify({ reason: "same_symbol_ignore" }),
          success: false,
          createdAt: new Date().toISOString(),
        });
        
        // LOG: Same symbol ignored
        await logToBot(
          'info',
          'alert_rejected',
          `Position already exists on ${data.symbol} - alert ignored`,
          { reason: 'same_symbol_position_exists', symbol: data.symbol, existingPositionId: existingPosition.id },
          alert.id,
          existingPosition.id
        );
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id,
          message: "Same symbol position exists, ignoring alert"
        });
      }

      // Check if opposite direction
      const isOpposite = 
        (existingPosition.side === "BUY" && data.side === "SELL") ||
        (existingPosition.side === "SELL" && data.side === "BUY");

      if (isOpposite) {
        if (botConfig.oppositeDirectionStrategy === "market_reversal") {
          console.log(`🔄 Closing opposite position and reversing on ${data.symbol}`);
          
          // LOG: Attempting reversal
          await logToBot(
            'info',
            'position_reversal_attempt',
            `Attempting to close opposite position and reverse: ${data.symbol}`,
            { existingPosition: existingPosition.side, newPosition: data.side, positionId: existingPosition.id },
            alert.id,
            existingPosition.id
          );
          
          // CRITICAL FIX: Use API credentials from database (not .env)
          try {
            const baseUrl = getBybitBaseUrl(environment);

            const closeTimestamp = Date.now();
            const closePayload = JSON.stringify({
              category: "linear",
              symbol: data.symbol,
              side: existingPosition.side === "BUY" ? "Sell" : "Buy",
              orderType: "Market",
              qty: existingPosition.quantity.toString(),
              timeInForce: "GTC",
              reduceOnly: true,
              closeOnTrigger: false
            });

            const closeSignature = createBybitSignature(apiKey, apiSecret, closeTimestamp, closePayload);

            const closeResponse = await fetch(`${baseUrl}/v5/order/create`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-BAPI-API-KEY": apiKey,
                "X-BAPI-TIMESTAMP": closeTimestamp.toString(),
                "X-BAPI-SIGN": closeSignature,
                "X-BAPI-RECV-WINDOW": "5000",
              },
              body: closePayload
            });

            // CRITICAL: Check if response is JSON before parsing
            const closeResponseText = await closeResponse.text();
            console.log("📥 Bybit Close Response (raw):", closeResponseText);
            
            let closeData;
            try {
              closeData = JSON.parse(closeResponseText);
            } catch (parseError) {
              console.error("❌ Bybit returned non-JSON response:", closeResponseText.substring(0, 500));
              throw new Error(`Bybit API returned HTML/non-JSON response. Check API keys! Response: ${closeResponseText.substring(0, 200)}`);
            }

            if (closeData.retCode !== 0) {
              throw new Error(`Bybit close failed: ${closeData.retMsg}`);
            }

            // Update database
            await db
              .update(botPositions)
              .set({ 
                status: "closed",
                closeReason: "opposite_signal",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, existingPosition.id));

            await db.insert(botActions).values({
              actionType: "position_closed",
              symbol: data.symbol,
              side: existingPosition.side,
              tier: existingPosition.tier,
              positionId: existingPosition.id,
              reason: "opposite_signal",
              details: JSON.stringify({ reason: "opposite_signal" }),
              success: true,
              createdAt: new Date().toISOString(),
            });

            // LOG: Reversal success
            await logToBot(
              'success',
              'position_closed',
              `Opposite position closed successfully: ${data.symbol}`,
              { reason: 'opposite_signal', orderId: closeData.result?.orderId },
              alert.id,
              existingPosition.id
            );

            console.log("✅ Opposite position closed, proceeding with new trade");
          } catch (error) {
            console.error("❌ Failed to close opposite position:", error);
            
            // Update alert status to rejected
            await db.update(alerts)
              .set({ 
                executionStatus: 'rejected',
                rejectionReason: 'failed_to_close_opposite_position'
              })
              .where(eq(alerts.id, alert.id));
            
            // LOG: Reversal failed
            await logToBot(
              'error',
              'position_close_failed',
              `Failed to close opposite position: ${error instanceof Error ? error.message : 'Unknown error'}`,
              { error: error instanceof Error ? error.message : String(error) },
              alert.id,
              existingPosition.id
            );
            
            // Zwróć 200 aby TradingView nie retry
            return NextResponse.json({ 
              success: true, 
              alert_id: alert.id,
              error: "Failed to close opposite position",
              message: "Alert saved but position opening failed"
            });
          }
        } else {
          console.log(`⚠️ Opposite direction signal on ${data.symbol}, ignoring`);
          
          // Update alert status to rejected
          await db.update(alerts)
            .set({ 
              executionStatus: 'rejected',
              rejectionReason: 'opposite_direction_ignored'
            })
            .where(eq(alerts.id, alert.id));
          
          await db.insert(botActions).values({
            actionType: "alert_ignored",
            symbol: data.symbol,
            side: data.side,
            tier: data.tier,
            alertId: alert.id,
            reason: "opposite_direction_ignore",
            details: JSON.stringify({ reason: "opposite_direction_ignore" }),
            success: false,
            createdAt: new Date().toISOString(),
          });
          
          // LOG: Opposite ignored
          await logToBot(
            'info',
            'alert_rejected',
            `Opposite direction signal ignored: ${data.symbol}`,
            { reason: 'opposite_direction_ignored', existingPositionSide: existingPosition.side, newSide: data.side },
            alert.id,
            existingPosition.id
          );
          
          return NextResponse.json({ 
            success: true, 
            alert_id: alert.id,
            message: "Opposite direction signal, ignoring alert"
          });
        }
      } else {
        // Same direction - track confirmations
        if (botConfig.sameSymbolBehavior === "track_confirmations") {
          console.log(`➕ Tracking confirmation for ${data.symbol}`);
          await db
            .update(botPositions)
            .set({ 
              confirmationCount: existingPosition.confirmationCount + 1,
              lastUpdated: new Date().toISOString(),
            })
            .where(eq(botPositions.id, existingPosition.id));
          
          // Update alert status to executed (confirmation tracked)
          await db.update(alerts)
            .set({ executionStatus: 'executed' })
            .where(eq(alerts.id, alert.id));
          
          // LOG: Confirmation tracked
          await logToBot(
            'info',
            'confirmation_tracked',
            `Confirmation tracked for ${data.symbol}: count=${existingPosition.confirmationCount + 1}`,
            { confirmationCount: existingPosition.confirmationCount + 1 },
            alert.id,
            existingPosition.id
          );
          
          return NextResponse.json({ 
            success: true, 
            alert_id: alert.id,
            message: "Confirmation tracked"
          });
        }
      }
    }

    // ============================================
    // 🎯 CALCULATE SL/TP VALUES
    // ============================================
    
    const entryPrice = parseFloat(data.entryPrice || data.price);
    let slPrice: number | null = null;
    let tp1Price: number | null = null;
    let tp2Price: number | null = null;
    let tp3Price: number | null = null;

    // Check if alert contains SL/TP values
    const hasSlTpInAlert = data.sl && data.tp1;

    if (hasSlTpInAlert) {
      // Use values from alert (priority)
      console.log("✅ Using SL/TP from alert");
      slPrice = parseFloat(data.sl);
      tp1Price = parseFloat(data.tp1);
      tp2Price = data.tp2 ? parseFloat(data.tp2) : null;
      tp3Price = data.tp3 ? parseFloat(data.tp3) : null;
    } else if (botConfig.useDefaultSlTp) {
      // Calculate default SL/TP based on entry price
      console.log("🛡️ Using default SL/TP from settings");
      
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

      console.log(`📊 Calculated SL/TP: SL=${slPrice}, TP1=${tp1Price}, TP2=${tp2Price}, TP3=${tp3Price}`);
    } else {
      // No SL/TP in alert and default SL/TP not enabled
      console.log("❌ No SL/TP provided and default SL/TP not enabled");
      
      // Update alert status to rejected
      await db.update(alerts)
        .set({ 
          executionStatus: 'rejected',
          rejectionReason: 'no_sl_tp_provided'
        })
        .where(eq(alerts.id, alert.id));
      
      await db.insert(botActions).values({
        actionType: "alert_ignored",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "no_sl_tp_provided",
        details: JSON.stringify({ reason: "no_sl_tp_provided" }),
        success: false,
        createdAt: new Date().toISOString(),
      });
      
      // LOG: No SL/TP
      await logToBot(
        'error',
        'alert_rejected',
        `No SL/TP provided and default SL/TP not enabled: ${data.symbol}`,
        { reason: 'no_sl_tp_provided' },
        alert.id
      );
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "No SL/TP provided and default SL/TP not enabled"
      });
    }

    // ============================================
    // 💰 CALCULATE POSITION SIZE
    // ============================================

    let positionSizeUsd = botConfig.positionSizeFixed;

    if (botConfig.positionSizeMode === "percent") {
      // Get account balance and calculate percentage
      // For now, use fixed size
      positionSizeUsd = botConfig.positionSizeFixed;
    }

    // Calculate quantity
    const quantity = positionSizeUsd / entryPrice;

    // Get leverage
    const leverage = botConfig.leverageMode === "from_alert" 
      ? (data.leverage || botConfig.leverageFixed) 
      : botConfig.leverageFixed;

    console.log(`💰 Position size: $${positionSizeUsd}, Qty: ${quantity}, Leverage: ${leverage}x`);

    // ============================================
    // 🚀 OPEN POSITION ON BYBIT (DIRECT API CALL)
    // ============================================

    try {
      console.log(`🔧 Using Bybit environment: ${environment}`);
      console.log(`🔑 API Key preview: ${apiKey.substring(0, 8)}...`);

      const baseUrl = getBybitBaseUrl(environment);
      const symbol = data.symbol;
      const side = data.side === "BUY" ? "Buy" : "Sell";
      const tpMode = botConfig.tpStrategy || "main_only";
      
      await logToBot(
        'info',
        'position_opening',
        `Opening position: ${symbol} ${side} ${leverage}x (env: ${environment})`,
        { symbol, side, leverage, quantity, entryPrice, sl: slPrice, tp1: tp1Price, environment },
        alert.id
      );

      // Step 1: Set Leverage
      if (leverage) {
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
            alert.id
          );

          if (leverageData.retCode !== 0 && leverageData.retCode !== 110043) {
            console.warn("⚠️ Leverage setting warning:", leverageData.retMsg);
            await logToBot(
              'warning',
              'leverage_set_warning',
              `Leverage setting warning: ${leverageData.retMsg}`,
              { retCode: leverageData.retCode, retMsg: leverageData.retMsg },
              alert.id
            );
          }
        } catch (leverageError: any) {
          console.warn("⚠️ Leverage setting failed:", leverageError.message);
          // Non-critical, continue with trade
        }
      }

      // Step 2: Open Position (Market Order)
      const { data: orderData } = await makeBybitRequest(
        `${baseUrl}/v5/order/create`,
        apiKey,
        apiSecret,
        {
          category: "linear",
          symbol,
          side,
          orderType: "Market",
          qty: quantity.toFixed(4),
          timeInForce: "GTC",
          reduceOnly: false,
          closeOnTrigger: false
        },
        alert.id
      );

      if (orderData.retCode !== 0) {
        throw new Error(`Bybit order failed (retCode ${orderData.retCode}): ${orderData.retMsg}`);
      }

      const orderId = orderData.result?.orderId;
      console.log("✅ Position opened on Bybit:", orderId);

      // Step 3: Set SL/TP
      if (slPrice || tp1Price) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const tpslParams: any = {
          category: "linear",
          symbol,
          positionIdx: 0
        };

        if (slPrice) {
          tpslParams.stopLoss = slPrice.toFixed(2);
        }

        if (tpMode === "multiple" && tp1Price) {
          tpslParams.takeProfit = tp1Price.toFixed(2);
        } else if (tp1Price) {
          tpslParams.takeProfit = tp1Price.toFixed(2);
        }

        try {
          const { data: tpslData } = await makeBybitRequest(
            `${baseUrl}/v5/position/trading-stop`,
            apiKey,
            apiSecret,
            tpslParams,
            alert.id
          );

          if (tpslData.retCode !== 0) {
            console.warn("⚠️ SL/TP setting warning:", tpslData.retMsg);
            await logToBot(
              'warning',
              'sl_tp_set_warning',
              `SL/TP setting warning: ${tpslData.retMsg}`,
              { retCode: tpslData.retCode, retMsg: tpslData.retMsg, sl: slPrice, tp: tp1Price },
              alert.id
            );
          }
        } catch (tpslError: any) {
          console.warn("⚠️ SL/TP setting failed:", tpslError.message);
          // Non-critical, position is already open
        }
      }

      // ============================================
      // 💾 SAVE POSITION TO DATABASE
      // ============================================

      const [botPosition] = await db.insert(botPositions).values({
        symbol: data.symbol,
        side: data.side,
        entryPrice: entryPrice,
        quantity: quantity,
        leverage: leverage,
        stopLoss: slPrice || 0,
        tp1Price: tp1Price,
        tp2Price: tp2Price,
        tp3Price: tp3Price,
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

      console.log("✅ Position saved to database:", botPosition.id);

      // Update alert status to executed
      await db.update(alerts)
        .set({ executionStatus: 'executed' })
        .where(eq(alerts.id, alert.id));

      // Save action
      await db.insert(botActions).values({
        actionType: "position_opened",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        positionId: botPosition.id,
        reason: "new_signal",
        details: JSON.stringify({
          tier: data.tier,
          confidence: data.strength,
          entry: entryPrice,
          quantity: quantity,
          leverage: leverage,
        }),
        success: true,
        createdAt: new Date().toISOString(),
      });
      
      // LOG: Position opened successfully
      await logToBot(
        'success',
        'position_opened',
        `✅ Position opened: ${symbol} ${side} ${leverage}x | Entry: ${entryPrice}`,
        {
          positionId: botPosition.id,
          orderId,
          symbol,
          side,
          leverage,
          quantity,
          entryPrice,
          sl: slPrice,
          tp1: tp1Price,
          tp2: tp2Price,
          tp3: tp3Price,
          tier: data.tier,
          environment
        },
        alert.id,
        botPosition.id
      );

      return NextResponse.json({
        success: true,
        alert_id: alert.id,
        position_id: botPosition.id,
        message: "Alert received and position opened successfully",
        position: {
          symbol: data.symbol,
          side: data.side,
          entry: entryPrice,
          quantity: quantity,
          sl: slPrice,
          tp1: tp1Price,
          tp2: tp2Price,
          tp3: tp3Price,
        },
      });
    } catch (error: any) {
      console.error("❌ Failed to open position:", error);

      // Update alert status to rejected
      await db.update(alerts)
        .set({ 
          executionStatus: 'rejected',
          rejectionReason: 'exchange_error'
        })
        .where(eq(alerts.id, alert.id));

      // Save failed action
      await db.insert(botActions).values({
        actionType: "position_failed",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "exchange_error",
        details: JSON.stringify({ error: error.message }),
        success: false,
        errorMessage: error.message,
        createdAt: new Date().toISOString(),
      });
      
      // LOG: Position opening failed
      await logToBot(
        'error',
        'order_failed',
        `❌ Failed to open position: ${error.message}`,
        {
          error: error.message,
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          environment
        },
        alert.id
      );

      // CRITICAL: Zwróć 200 aby TradingView nie retry
      return NextResponse.json({
        success: true,
        alert_id: alert.id,
        error: error.message,
        message: "Alert saved but position opening failed"
      });
    }
  } catch (error: any) {
    console.error("❌ Webhook error:", error);
    
    // LOG: Critical webhook error
    await logToBot(
      'error',
      'webhook_error',
      `Critical webhook error: ${error.message}`,
      { error: error.message, stack: error.stack }
    );
    
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}