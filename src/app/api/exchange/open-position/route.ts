import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// USE EXACT SAME SIGNING METHOD AS get-balance (which works!)
function createBybitSignature(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): string {
  const paramString = timestamp + apiKey + "5000" + JSON.stringify(params);
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
      const leverageTimestamp = Date.now(); // NUMBER not string!
      const leverageParams = {
        category: "linear",
        symbol,
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      };

      const leverageSignature = createBybitSignature(
        apiKey,
        apiSecret,
        leverageTimestamp,
        leverageParams
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
        body: JSON.stringify(leverageParams)
      });

      const leverageData = await leverageResponse.json();

      // Non-critical error - leverage might already be set
      if (leverageData.retCode !== 0 && leverageData.retCode !== 110043) {
        console.warn("Leverage setting warning:", leverageData.retMsg);
      }
    }

    // Step 2: Open Position (Market Order)
    const orderTimestamp = Date.now(); // NUMBER not string!
    const orderParams = {
      category: "linear",
      symbol,
      side,
      orderType: "Market",
      qty: quantity,
      timeInForce: "GTC",
      reduceOnly: false,
      closeOnTrigger: false
    };

    const orderSignature = createBybitSignature(
      apiKey,
      apiSecret,
      orderTimestamp,
      orderParams
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
      body: JSON.stringify(orderParams)
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
      // Wait 500ms for position to be created
      await new Promise(resolve => setTimeout(resolve, 500));

      const tpslTimestamp = Date.now(); // NUMBER not string!
      const tpslParams: any = {
        category: "linear",
        symbol,
        positionIdx: 0 // One-Way Mode
      };

      // Set Stop Loss
      if (stopLoss) {
        tpslParams.stopLoss = stopLoss;
      }

      // Set Take Profit based on mode
      if (tpMode === "multiple" && tp1) {
        tpslParams.takeProfit = tp1;
      } else if (takeProfit) {
        tpslParams.takeProfit = takeProfit;
      }

      const tpslSignature = createBybitSignature(
        apiKey,
        apiSecret,
        tpslTimestamp,
        tpslParams
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
        body: JSON.stringify(tpslParams)
      });

      const tpslData = await tpslResponse.json();

      if (tpslData.retCode !== 0) {
        console.warn("SL/TP setting warning:", tpslData.retMsg);
        // Non-critical - position is already opened
      }

      // Step 4: Set TP2 and TP3 as limit orders (if multiple TP mode)
      if (tpMode === "multiple" && (tp2 || tp3)) {
        const qty1 = parseFloat(quantity) * 0.5; // 50% for TP1
        const qty2 = parseFloat(quantity) * 0.3; // 30% for TP2
        const qty3 = parseFloat(quantity) * 0.2; // 20% for TP3

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

        // Create TP2/TP3 limit orders
        for (const tp of tpOrders) {
          const tpOrderTimestamp = Date.now(); // NUMBER not string!
          const tpOrderParams = {
            category: "linear",
            symbol,
            side: side === "Buy" ? "Sell" : "Buy", // Opposite side to close
            orderType: "Limit",
            qty: tp.qty,
            price: tp.price,
            timeInForce: "GTC",
            reduceOnly: true,
            closeOnTrigger: false,
            orderLinkId: `${orderId}_${tp.label}` // Link to main order
          };

          const tpOrderSignature = createBybitSignature(
            apiKey,
            apiSecret,
            tpOrderTimestamp,
            tpOrderParams
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
            body: JSON.stringify(tpOrderParams)
          });

          // Small delay between orders
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