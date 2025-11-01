import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ============================================
// 🔐 OKX SIGNATURE & API HELPER
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
// 🔍 GET AVAILABLE INSTRUMENTS (for debugging)
// ============================================

async function getOkxInstruments(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  instType: string = 'SWAP'
) {
  const baseUrl = 'https://www.okx.com';
  const requestPath = `/api/v5/public/instruments?instType=${instType}`;
  
  try {
    const response = await fetch(`${baseUrl}${requestPath}`);
    const data = await response.json();
    
    if (data.code === '0' && data.data) {
      const symbols = data.data.map((inst: any) => inst.instId);
      console.log(`📋 Available OKX ${instType} instruments (${symbols.length} total):`, symbols.slice(0, 20));
      return symbols;
    }
  } catch (error) {
    console.error('❌ Failed to fetch OKX instruments:', error);
  }
  return [];
}

async function makeOkxRequest(
  url: string,
  method: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  body?: any
) {
  const timestamp = new Date().toISOString();
  const requestPath = url.replace('https://www.okx.com', '');
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

  const response = await fetch(url, {
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
    throw new Error(`Nieprawidłowa odpowiedź JSON od OKX: ${responseText.substring(0, 200)}`);
  }

  return { response, data };
}

// ============================================
// 🚀 OPEN POSITION ON OKX
// ============================================

async function openOkxPosition(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean,
  symbol: string,
  side: string,
  quantity: string,
  leverage?: string,
  stopLoss?: string,
  takeProfit?: string
) {
  const baseUrl = 'https://www.okx.com';
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 OPENING OKX POSITION - START`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Input Parameters:`);
  console.log(`   - Original Symbol: ${symbol}`);
  console.log(`   - Side: ${side}`);
  console.log(`   - Quantity: ${quantity}`);
  console.log(`   - Leverage: ${leverage || 'not set'}`);
  console.log(`   - Environment: ${demo ? 'DEMO' : 'PRODUCTION'}`);
  
  // ✅ Convert symbol to OKX format
  const okxSymbol = convertSymbolToOkx(symbol);
  console.log(`\n🔄 Symbol after conversion: ${okxSymbol}`);
  
  // 🔍 Debug: Fetch available instruments to verify symbol exists
  console.log(`\n🔍 Fetching available instruments to verify symbol...`);
  const availableInstruments = await getOkxInstruments(apiKey, apiSecret, passphrase, demo, 'SWAP');
  const symbolExists = availableInstruments.includes(okxSymbol);
  
  if (!symbolExists && availableInstruments.length > 0) {
    console.error(`\n❌ CRITICAL: Symbol ${okxSymbol} NOT FOUND in available instruments!`);
    console.log(`\n💡 Searching for similar symbols...`);
    const baseCurrency = symbol.replace(/USDT|USD/, '');
    const similar = availableInstruments.filter((inst: string) => inst.includes(baseCurrency));
    console.log(`   Similar symbols found:`, similar.length > 0 ? similar : 'NONE');
    
    if (similar.length > 0) {
      throw new Error(`Symbol ${okxSymbol} not found. Did you mean: ${similar[0]}? Available: ${similar.join(', ')}`);
    } else {
      throw new Error(`Symbol ${okxSymbol} not available on OKX ${demo ? 'DEMO' : 'PRODUCTION'}. Check symbol format or try a different pair.`);
    }
  } else {
    console.log(`✅ Symbol ${okxSymbol} verified as available`);
  }
  
  // Step 1: Set leverage if provided
  if (leverage) {
    console.log(`\n📏 Setting leverage to ${leverage}x...`);
    try {
      const leveragePayload = {
        instId: okxSymbol,
        lever: leverage,
        mgnMode: 'cross'
      };
      console.log(`📤 Leverage payload:`, JSON.stringify(leveragePayload, null, 2));
      
      const { data: leverageData } = await makeOkxRequest(
        `${baseUrl}/api/v5/account/set-leverage`,
        'POST',
        apiKey,
        apiSecret,
        passphrase,
        demo,
        leveragePayload
      );

      console.log(`📥 Leverage response:`, JSON.stringify(leverageData, null, 2));

      if (leverageData.code !== '0') {
        console.error(`❌ Leverage setting failed (code ${leverageData.code}): ${leverageData.msg}`);
        throw new Error(`Cannot set leverage for ${okxSymbol}: ${leverageData.msg}`);
      } else {
        console.log(`✅ Leverage set successfully: ${leverage}x for ${okxSymbol}`);
      }
    } catch (leverageError: any) {
      console.error(`❌ Leverage error:`, leverageError);
      throw new Error(`Leverage setting failed: ${leverageError.message}`);
    }
  }

  // Step 2: Open position (market order)
  console.log(`\n📈 Opening market position...`);
  const orderPayload: any = {
    instId: okxSymbol,
    tdMode: 'cross',
    side: side.toLowerCase() === 'buy' ? 'buy' : 'sell',
    ordType: 'market',
    sz: quantity,
  };

  // Add SL/TP if provided
  if (stopLoss) {
    orderPayload.slTriggerPx = stopLoss;
    orderPayload.slOrdPx = '-1'; // Market order for SL
    console.log(`🛑 Stop Loss set: ${stopLoss}`);
  }

  if (takeProfit) {
    orderPayload.tpTriggerPx = takeProfit;
    orderPayload.tpOrdPx = '-1'; // Market order for TP
    console.log(`🎯 Take Profit set: ${takeProfit}`);
  }

  console.log(`📤 Order payload:`, JSON.stringify(orderPayload, null, 2));

  const { data: orderData } = await makeOkxRequest(
    `${baseUrl}/api/v5/trade/order`,
    'POST',
    apiKey,
    apiSecret,
    passphrase,
    demo,
    orderPayload
  );

  console.log(`📥 Order response:`, JSON.stringify(orderData, null, 2));

  if (orderData.code !== '0') {
    console.error(`❌ Order failed (code ${orderData.code}): ${orderData.msg}`);
    throw new Error(`OKX order failed (code ${orderData.code}): ${orderData.msg}`);
  }

  const orderId = orderData.data?.[0]?.ordId;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ POSITION OPENED SUCCESSFULLY`);
  console.log(`   - Order ID: ${orderId}`);
  console.log(`   - Symbol: ${okxSymbol}`);
  console.log(`   - Side: ${side}`);
  console.log(`   - Quantity: ${quantity}`);
  console.log(`${'='.repeat(60)}\n`);

  return {
    success: true,
    orderId,
    symbol: okxSymbol,
    side,
    quantity,
    leverage,
    stopLoss,
    takeProfit,
    message: `Position opened successfully on OKX for ${okxSymbol}`
  };
}

// ============================================
// 📨 POST ENDPOINT
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      exchange,
      apiKey,
      apiSecret,
      passphrase,
      environment,
      symbol,
      side,
      quantity,
      leverage,
      stopLoss,
      takeProfit,
      tp1,
    } = body;

    // Validation
    if (!exchange || !apiKey || !apiSecret || !symbol || !side || !quantity) {
      return NextResponse.json({
        success: false,
        error: "Missing required fields",
        code: "MISSING_FIELDS"
      }, { status: 400 });
    }

    // Only support OKX
    if (exchange !== "okx") {
      return NextResponse.json({
        success: false,
        error: "Only OKX is supported. Update your exchange to OKX.",
        code: "UNSUPPORTED_EXCHANGE"
      }, { status: 400 });
    }

    if (!passphrase) {
      return NextResponse.json({
        success: false,
        error: "Passphrase is required for OKX",
        code: "MISSING_PASSPHRASE"
      }, { status: 400 });
    }

    if (side !== "Buy" && side !== "Sell" && side !== "buy" && side !== "sell") {
      return NextResponse.json({
        success: false,
        error: 'Side must be "Buy" or "Sell"',
        code: "INVALID_SIDE"
      }, { status: 400 });
    }

    const demo = environment === "demo";
    const result = await openOkxPosition(
      apiKey,
      apiSecret,
      passphrase,
      demo,
      symbol,
      side,
      quantity,
      leverage,
      stopLoss,
      takeProfit || tp1
    );
    
    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error("Open position error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}