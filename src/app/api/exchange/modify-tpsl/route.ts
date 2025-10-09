import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Helper function to sign Bybit request
function signBybitRequest(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
): string {
  const queryString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&");
  
  const signString = timestamp + apiKey + 5000 + queryString;
  
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(signString)
    .digest("hex");
  
  return signature;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      exchange,
      apiKey,
      apiSecret,
      environment,
      symbol,
      side, // "Buy" or "Sell" - current position side
      stopLoss, // new SL (optional)
      takeProfit, // new main TP (optional)
      tp2, // new TP2 (optional, for limit orders)
      tp3, // new TP3 (optional, for limit orders)
      oldTp2OrderLinkId, // old TP2 order to cancel
      oldTp3OrderLinkId, // old TP3 order to cancel
      positionQty, // current position quantity (needed for TP2/TP3 calculation)
    } = body;

    if (!exchange || !apiKey || !apiSecret || !symbol || !side) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    if (exchange !== "bybit") {
      return NextResponse.json(
        { success: false, message: "Only Bybit is supported for now" },
        { status: 400 }
      );
    }

    const baseUrl =
      environment === "demo"
        ? "https://api-demo.bybit.com"
        : environment === "testnet"
        ? "https://api-testnet.bybit.com"
        : "https://api.bybit.com";

    const results: any = {
      mainTpSlUpdated: false,
      tp2Updated: false,
      tp3Updated: false,
      errors: [],
    };

    // Step 1: Modify main TP/SL using trading-stop
    if (stopLoss || takeProfit) {
      try {
        const timestamp = Date.now();
        const tradingStopParams: Record<string, any> = {
          category: "linear",
          symbol: symbol,
          positionIdx: 0, // One-Way Mode
        };

        if (stopLoss) {
          tradingStopParams.stopLoss = stopLoss;
          tradingStopParams.slTriggerBy = "MarkPrice";
        }

        if (takeProfit) {
          tradingStopParams.takeProfit = takeProfit;
          tradingStopParams.tpTriggerBy = "MarkPrice";
        }

        const signature = signBybitRequest(
          apiKey,
          apiSecret,
          timestamp,
          tradingStopParams
        );

        const response = await fetch(`${baseUrl}/v5/position/trading-stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": apiKey,
            "X-BAPI-TIMESTAMP": timestamp.toString(),
            "X-BAPI-SIGN": signature,
            "X-BAPI-RECV-WINDOW": "5000",
          },
          body: JSON.stringify(tradingStopParams),
        });

        const data = await response.json();

        if (data.retCode === 0) {
          results.mainTpSlUpdated = true;
          console.log("✅ Main TP/SL updated successfully");
        } else {
          results.errors.push(`Main TP/SL update failed: ${data.retMsg}`);
        }
      } catch (err) {
        results.errors.push(`Error updating main TP/SL: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Step 2: Update TP2 (cancel old, create new)
    if (tp2 && positionQty) {
      try {
        // Cancel old TP2 if exists
        if (oldTp2OrderLinkId) {
          const timestamp = Date.now();
          const cancelParams = {
            category: "linear",
            symbol: symbol,
            orderLinkId: oldTp2OrderLinkId,
          };

          const cancelSignature = signBybitRequest(apiKey, apiSecret, timestamp, cancelParams);

          await fetch(`${baseUrl}/v5/order/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-BAPI-API-KEY": apiKey,
              "X-BAPI-TIMESTAMP": timestamp.toString(),
              "X-BAPI-SIGN": cancelSignature,
              "X-BAPI-RECV-WINDOW": "5000",
            },
            body: JSON.stringify(cancelParams),
          });
        }

        // Create new TP2
        const timestamp = Date.now();
        const tp2Qty = (parseFloat(positionQty) * 0.3).toFixed(3); // 30% of position
        const closeSide = side === "Buy" ? "Sell" : "Buy";

        const tp2Params = {
          category: "linear",
          symbol: symbol,
          side: closeSide,
          orderType: "Limit",
          qty: tp2Qty,
          price: tp2,
          reduceOnly: true,
          positionIdx: 0,
          timeInForce: "GoodTillCancel",
          orderLinkId: `tp2_${Date.now()}`,
        };

        const tp2Signature = signBybitRequest(apiKey, apiSecret, timestamp, tp2Params);

        const tp2Response = await fetch(`${baseUrl}/v5/order/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": apiKey,
            "X-BAPI-TIMESTAMP": timestamp.toString(),
            "X-BAPI-SIGN": tp2Signature,
            "X-BAPI-RECV-WINDOW": "5000",
          },
          body: JSON.stringify(tp2Params),
        });

        const tp2Data = await tp2Response.json();

        if (tp2Data.retCode === 0) {
          results.tp2Updated = true;
          results.newTp2OrderLinkId = tp2Data.result?.orderLinkId;
          console.log("✅ TP2 updated successfully");
        } else {
          results.errors.push(`TP2 update failed: ${tp2Data.retMsg}`);
        }
      } catch (err) {
        results.errors.push(`Error updating TP2: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Step 3: Update TP3 (cancel old, create new)
    if (tp3 && positionQty) {
      try {
        // Cancel old TP3 if exists
        if (oldTp3OrderLinkId) {
          const timestamp = Date.now();
          const cancelParams = {
            category: "linear",
            symbol: symbol,
            orderLinkId: oldTp3OrderLinkId,
          };

          const cancelSignature = signBybitRequest(apiKey, apiSecret, timestamp, cancelParams);

          await fetch(`${baseUrl}/v5/order/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-BAPI-API-KEY": apiKey,
              "X-BAPI-TIMESTAMP": timestamp.toString(),
              "X-BAPI-SIGN": cancelSignature,
              "X-BAPI-RECV-WINDOW": "5000",
            },
            body: JSON.stringify(cancelParams),
          });
        }

        // Create new TP3
        const timestamp = Date.now();
        const tp3Qty = (parseFloat(positionQty) * 0.2).toFixed(3); // 20% of position
        const closeSide = side === "Buy" ? "Sell" : "Buy";

        const tp3Params = {
          category: "linear",
          symbol: symbol,
          side: closeSide,
          orderType: "Limit",
          qty: tp3Qty,
          price: tp3,
          reduceOnly: true,
          positionIdx: 0,
          timeInForce: "GoodTillCancel",
          orderLinkId: `tp3_${Date.now()}`,
        };

        const tp3Signature = signBybitRequest(apiKey, apiSecret, timestamp, tp3Params);

        const tp3Response = await fetch(`${baseUrl}/v5/order/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BAPI-API-KEY": apiKey,
            "X-BAPI-TIMESTAMP": timestamp.toString(),
            "X-BAPI-SIGN": tp3Signature,
            "X-BAPI-RECV-WINDOW": "5000",
          },
          body: JSON.stringify(tp3Params),
        });

        const tp3Data = await tp3Response.json();

        if (tp3Data.retCode === 0) {
          results.tp3Updated = true;
          results.newTp3OrderLinkId = tp3Data.result?.orderLinkId;
          console.log("✅ TP3 updated successfully");
        } else {
          results.errors.push(`TP3 update failed: ${tp3Data.retMsg}`);
        }
      } catch (err) {
        results.errors.push(`Error updating TP3: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // Determine success
    const hasUpdates = results.mainTpSlUpdated || results.tp2Updated || results.tp3Updated;
    const hasErrors = results.errors.length > 0;

    if (!hasUpdates && hasErrors) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to update TP/SL",
          errors: results.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "TP/SL modifications completed",
      results,
    });
  } catch (error) {
    console.error("Error modifying TP/SL:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}