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
  
  // Step 1: Set leverage if provided
  if (leverage) {
    try {
      const { data: leverageData } = await makeOkxRequest(
        `${baseUrl}/api/v5/account/set-leverage`,
        'POST',
        apiKey,
        apiSecret,
        passphrase,
        demo,
        {
          instId: symbol,
          lever: leverage,
          mgnMode: 'cross'
        }
      );

      if (leverageData.code !== '0') {
        console.warn('OKX leverage setting warning:', leverageData.msg);
      } else {
        console.log(`✅ OKX leverage set: ${leverage}x`);
      }
    } catch (leverageError: any) {
      console.warn('⚠️ OKX leverage setting failed:', leverageError.message);
    }
  }

  // Step 2: Open position (market order)
  const orderPayload: any = {
    instId: symbol,
    tdMode: 'cross',
    side: side.toLowerCase() === 'buy' ? 'buy' : 'sell',
    ordType: 'market',
    sz: quantity,
  };

  // Add SL/TP if provided
  if (stopLoss) {
    orderPayload.slTriggerPx = stopLoss;
    orderPayload.slOrdPx = '-1'; // Market order for SL
  }

  if (takeProfit) {
    orderPayload.tpTriggerPx = takeProfit;
    orderPayload.tpOrdPx = '-1'; // Market order for TP
  }

  const { data: orderData } = await makeOkxRequest(
    `${baseUrl}/api/v5/trade/order`,
    'POST',
    apiKey,
    apiSecret,
    passphrase,
    demo,
    orderPayload
  );

  if (orderData.code !== '0') {
    throw new Error(`OKX order failed (code ${orderData.code}): ${orderData.msg}`);
  }

  const orderId = orderData.data?.[0]?.ordId;
  console.log('✅ OKX position opened:', orderId);

  return {
    success: true,
    orderId,
    symbol,
    side,
    quantity,
    leverage,
    stopLoss,
    takeProfit,
    message: 'Position opened successfully on OKX'
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