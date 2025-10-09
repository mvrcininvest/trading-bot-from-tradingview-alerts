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
      side, // "Buy" or "Sell" - the side to CLOSE
      qty, // optional - if not provided, close entire position
      orderLinkIds // optional array of order link IDs to cancel (TP1, TP2, TP3)
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

    // Step 1: Cancel all pending TP orders if provided
    if (orderLinkIds && orderLinkIds.length > 0) {
      console.log(`Cancelling ${orderLinkIds.length} pending orders...`);
      
      for (const orderLinkId of orderLinkIds) {
        try {
          const timestamp = Date.now();
          const cancelParams = {
            category: "linear",
            symbol: symbol,
            orderLinkId: orderLinkId
          };

          const cancelSignature = signBybitRequest(
            apiKey,
            apiSecret,
            timestamp,
            cancelParams
          );

          const cancelResponse = await fetch(`${baseUrl}/v5/order/cancel`, {
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

          const cancelData = await cancelResponse.json();
          
          if (cancelData.retCode === 0) {
            console.log(`✅ Cancelled order: ${orderLinkId}`);
          } else {
            console.log(`⚠️ Failed to cancel order ${orderLinkId}: ${cancelData.retMsg}`);
          }
        } catch (err) {
          console.error(`Error cancelling order ${orderLinkId}:`, err);
        }
      }
    }

    // Step 2: Close position
    const timestamp = Date.now();
    
    // Closing position means placing opposite order
    const closeSide = side === "Buy" ? "Sell" : "Buy";
    
    const closeParams: Record<string, any> = {
      category: "linear",
      symbol: symbol,
      side: closeSide,
      orderType: "Market",
      qty: qty || "0", // "0" means close entire position
      reduceOnly: true,
      positionIdx: 0, // One-Way Mode
      timeInForce: "GoodTillCancel"
    };

    const closeSignature = signBybitRequest(
      apiKey,
      apiSecret,
      timestamp,
      closeParams
    );

    const closeResponse = await fetch(`${baseUrl}/v5/order/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp.toString(),
        "X-BAPI-SIGN": closeSignature,
        "X-BAPI-RECV-WINDOW": "5000",
      },
      body: JSON.stringify(closeParams),
    });

    const closeData = await closeResponse.json();

    if (closeData.retCode !== 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Failed to close position: ${closeData.retMsg}`,
          retCode: closeData.retCode,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Position closed successfully",
      orderId: closeData.result?.orderId,
      orderLinkId: closeData.result?.orderLinkId,
      cancelledOrders: orderLinkIds?.length || 0,
      data: closeData.result,
    });
  } catch (error) {
    console.error("Error closing position:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}