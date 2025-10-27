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

    // Step 1: Set Leverage
    if (leverage) {
      const leverageTimestamp = Date.now();
      const leveragePayload = JSON.stringify({
        category: "linear",
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      });

      const leverageSignature = createBybitSignature(
        apiKey,
        apiSecret,
        leverageTimestamp,
        leveragePayload
      );

      const leverageResponse = await fetch(`${baseUrl}/v5/position/set-leverage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-TIMESTAMP": leverageTimestamp.toString(),
          "X-BAPI-SIGN": leverageSignature,
          "X-BAPI-RECV-WINDOW": "5000",
        },
        body: leveragePayload
      });

      const leverageData = await leverageResponse.json();

      // Non-critical error - leverage might already be set
      if (leverageData.retCode !== 0 && leverageData.retCode !== 110043) {
        console.warn("Leverage setting warning:", leverageData.retMsg);
      }
    }

    // Step 2: Open Position (Market Order)
    const orderTimestamp = Date.now();
    const orderPayload = JSON.stringify({
      category: "linear",
      symbol,
      side,
      orderType: "Market",
      qty: quantity,
      timeInForce: "GTC",
      reduceOnly: false,
      closeOnTrigger: false
    });

    const orderSignature = createBybitSignature(
      apiKey,
      apiSecret,
      orderTimestamp,
      orderPayload
    );

    const orderResponse = await fetch(`${baseUrl}/v5/order/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": orderTimestamp.toString(),
        "X-BAPI-SIGN": orderSignature,
        "X-BAPI-RECV-WINDOW": "5000",
      },
      body: orderPayload
    });

    const orderData = await orderResponse.json();

    if (orderData.retCode !== 0) {
      return NextResponse.json({
        success: false,
        error: `Bybit order failed: ${orderData.retMsg}`,
        code: "ORDER_FAILED",
        details: orderData
      }, { status: 400 });
    }

    const orderId = orderData.result?.orderId;

    // Step 3: Set SL/TP
    if (stopLoss || takeProfit || tp1) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const tpslTimestamp = Date.now();
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

      const tpslPayload = JSON.stringify(tpslParams);
      const tpslSignature = createBybitSignature(
        apiKey,
        apiSecret,
        tpslTimestamp,
        tpslPayload
      );

      const tpslResponse = await fetch(`${baseUrl}/v5/position/trading-stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-TIMESTAMP": tpslTimestamp.toString(),
          "X-BAPI-SIGN": tpslSignature,
          "X-BAPI-RECV-WINDOW": "5000",
        },
        body: tpslPayload
      });

      const tpslData = await tpslResponse.json();

      if (tpslData.retCode !== 0) {
        console.warn("SL/TP setting warning:", tpslData.retMsg);
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
          const tpOrderTimestamp = Date.now();
          const tpOrderPayload = JSON.stringify({
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
          });

          const tpOrderSignature = createBybitSignature(
            apiKey,
            apiSecret,
            tpOrderTimestamp,
            tpOrderPayload
          );

          await fetch(`${baseUrl}/v5/order/create`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-BAPI-API-KEY": apiKey,
              "X-BAPI-TIMESTAMP": tpOrderTimestamp.toString(),
              "X-BAPI-SIGN": tpOrderSignature,
              "X-BAPI-RECV-WINDOW": "5000",
            },
            body: tpOrderPayload
          });

          await new Promise(resolve => setTimeout(resolve, 200));
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