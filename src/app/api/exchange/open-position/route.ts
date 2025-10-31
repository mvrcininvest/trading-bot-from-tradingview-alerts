import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// CRITICAL FIX: For POST requests, sign with the EXACT JSON string sent in body
function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  payloadString: string
): string {
  const paramString = timestamp + apiKey + "5000" + payloadString;
  return crypto.createHmac('sha256', apiSecret).update(paramString).digest('hex');
}

function getBybitBaseUrl(environment: string): string {
  if (environment === "demo") return "https://api-demo.bybit.com";
  if (environment === "testnet") return "https://api-testnet.bybit.com";
  return "https://api.bybit.com";
}

// Helper function to make Bybit API calls with proper error handling
async function makeBybitRequest(url: string, apiKey: string, apiSecret: string, payload: any) {
  const timestamp = Date.now();
  const payloadString = JSON.stringify(payload);
  const signature = createBybitSignature(apiKey, apiSecret, timestamp, payloadString);

  console.log("🔑 Bybit Request:", { url, timestamp, payload: payloadString });

  // CRITICAL FIX: Use MINIMAL headers - exactly like working client-side code
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

  // Check if response is HTML (CloudFlare block or error)
  if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
    console.error("❌ Bybit returned HTML instead of JSON");
    throw new Error(
      'Bybit API blocked or wrong environment. Sprawdź:\n' +
      '1. Klucze API są poprawne i mają uprawnienia do tradingu\n' +
      '2. BYBIT_ENVIRONMENT w .env zgadza się z typem kluczy (demo/testnet/mainnet)\n' +
      '3. IP jest dodane do whitelisty w ustawieniach API Bybit\n' +
      `4. Obecne środowisko: ${process.env.BYBIT_ENVIRONMENT || 'nie ustawione'}`
    );
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error("❌ Failed to parse Bybit response:", responseText.substring(0, 500));
    throw new Error(`Nieprawidłowa odpowiedź JSON od Bybit: ${responseText.substring(0, 200)}`);
  }

  return { response, data };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      exchange,
      apiKey,
      apiSecret,
      environment,
      symbol,
      side,
      quantity,
      leverage,
      stopLoss,
      takeProfit,
      tp1,
      tp2,
      tp3,
      tpMode = "main_only"
    } = body;

    // Validation
    if (!exchange || !apiKey || !apiSecret || !symbol || !side || !quantity) {
      return NextResponse.json({
        success: false,
        error: "Missing required fields",
        code: "MISSING_FIELDS"
      }, { status: 400 });
    }

    if (exchange !== "bybit") {
      return NextResponse.json({
        success: false,
        error: "Only Bybit is currently supported",
        code: "UNSUPPORTED_EXCHANGE"
      }, { status: 400 });
    }

    if (side !== "Buy" && side !== "Sell") {
      return NextResponse.json({
        success: false,
        error: 'Side must be "Buy" or "Sell"',
        code: "INVALID_SIDE"
      }, { status: 400 });
    }

    const baseUrl = getBybitBaseUrl(environment || "mainnet");
    console.log(`🔧 Using Bybit environment: ${environment || "mainnet"}`);

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
          }
        );

        // Non-critical error - leverage might already be set
        if (leverageData.retCode !== 0 && leverageData.retCode !== 110043) {
          console.warn("Leverage setting warning:", leverageData.retMsg);
        }
      } catch (leverageError: any) {
        console.warn("⚠️ Leverage setting failed:", leverageError.message);
        // Continue with trade
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
        qty: quantity,
        timeInForce: "GTC",
        reduceOnly: false,
        closeOnTrigger: false
      }
    );

    if (orderData.retCode !== 0) {
      return NextResponse.json({
        success: false,
        error: `Bybit order failed (retCode ${orderData.retCode}): ${orderData.retMsg}`,
        code: "ORDER_FAILED",
        details: orderData
      }, { status: 400 });
    }

    const orderId = orderData.result?.orderId;
    console.log("✅ Position opened:", orderId);

    // Step 3: Set SL/TP
    if (stopLoss || takeProfit || tp1) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const tpslParams: any = {
        category: "linear",
        symbol,
        positionIdx: 0
      };

      if (stopLoss) {
        tpslParams.stopLoss = stopLoss;
      }

      if (tpMode === "multiple" && tp1) {
        tpslParams.takeProfit = tp1;
      } else if (takeProfit) {
        tpslParams.takeProfit = takeProfit;
      }

      try {
        const { data: tpslData } = await makeBybitRequest(
          `${baseUrl}/v5/position/trading-stop`,
          apiKey,
          apiSecret,
          tpslParams
        );

        if (tpslData.retCode !== 0) {
          console.warn("SL/TP setting warning:", tpslData.retMsg);
        }
      } catch (tpslError: any) {
        console.warn("⚠️ SL/TP setting failed:", tpslError.message);
        // Non-critical, position already open
      }

      // Step 4: Set TP2 and TP3 as limit orders (if multiple TP mode)
      if (tpMode === "multiple" && (tp2 || tp3)) {
        const qty1 = parseFloat(quantity) * 0.5;
        const qty2 = parseFloat(quantity) * 0.3;
        const qty3 = parseFloat(quantity) * 0.2;

        const tpOrders = [];

        if (tp2) {
          tpOrders.push({
            price: tp2,
            qty: qty2.toFixed(4),
            label: "TP2"
          });
        }

        if (tp3) {
          tpOrders.push({
            price: tp3,
            qty: qty3.toFixed(4),
            label: "TP3"
          });
        }

        for (const tp of tpOrders) {
          try {
            await makeBybitRequest(
              `${baseUrl}/v5/order/create`,
              apiKey,
              apiSecret,
              {
                category: "linear",
                symbol,
                side: side === "Buy" ? "Sell" : "Buy",
                orderType: "Limit",
                qty: tp.qty,
                price: tp.price,
                timeInForce: "GTC",
                reduceOnly: true,
                closeOnTrigger: false,
                orderLinkId: `${orderId}_${tp.label}`
              }
            );
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (tpError: any) {
            console.warn(`⚠️ ${tp.label} order failed:`, tpError.message);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      orderId,
      symbol,
      side,
      quantity,
      leverage,
      stopLoss,
      takeProfit: tpMode === "multiple" ? tp1 : takeProfit,
      tp2,
      tp3,
      tpMode,
      message: "Position opened successfully"
    }, { status: 200 });

  } catch (error) {
    console.error("Open position error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}