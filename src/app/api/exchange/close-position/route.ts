import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { botPositions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// ============================================
// 🔐 OKX SIGNATURE HELPER
// ============================================

function signOkxRequest(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const message = timestamp + method + requestPath + body;
  return crypto
    .createHmac("sha256", apiSecret)
    .update(message)
    .digest("base64");
}

// ============================================
// 📨 POST ENDPOINT - CLOSE POSITION (OKX ONLY)
// ============================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      exchange,
      apiKey,
      apiSecret,
      passphrase,
      environment,
      symbol,
      cancelOrders = true, // NEW: Option to cancel SL/TP orders
    } = body;

    if (!exchange || !apiKey || !apiSecret || !symbol) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Only support OKX
    if (exchange !== "okx") {
      return NextResponse.json(
        { success: false, message: "Only OKX is supported. Update your exchange to OKX." },
        { status: 400 }
      );
    }

    if (!passphrase) {
      return NextResponse.json(
        { success: false, message: "Passphrase is required for OKX" },
        { status: 400 }
      );
    }

    const baseUrl = "https://www.okx.com";
    const demo = environment === "demo";

    try {
      // Close position using OKX close-position endpoint
      const timestamp = new Date().toISOString();
      const requestPath = "/api/v5/trade/close-position";
      
      const closePayload = {
        instId: symbol,
        mgnMode: "cross",
      };

      const bodyString = JSON.stringify(closePayload);
      const signature = signOkxRequest(timestamp, "POST", requestPath, bodyString, apiSecret);

      const headers: Record<string, string> = {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      };

      if (demo) {
        headers["x-simulated-trading"] = "1";
      }

      const closeResponse = await fetch(`${baseUrl}${requestPath}`, {
        method: "POST",
        headers,
        body: bodyString,
      });

      const closeData = await closeResponse.json();

      if (closeData.code !== "0") {
        return NextResponse.json(
          {
            success: false,
            message: `Failed to close OKX position: ${closeData.msg}`,
            code: closeData.code,
          },
          { status: 400 }
        );
      }

      // NEW: Cancel all algo orders (SL/TP) for this symbol if requested
      let ordersCancelled = 0;
      if (cancelOrders) {
        try {
          console.log(`\n🧹 Cancelling algo orders for ${symbol}...`);
          
          const algoTimestamp = new Date().toISOString();
          const algoMethod = "GET";
          const algoPath = "/api/v5/trade/orders-algo-pending";
          const algoQuery = `?ordType=conditional&instId=${symbol}`;
          
          const algoSignature = signOkxRequest(
            algoTimestamp,
            algoMethod,
            algoPath + algoQuery,
            "",
            apiSecret
          );
          
          const algoHeaders: Record<string, string> = {
            "OK-ACCESS-KEY": apiKey,
            "OK-ACCESS-SIGN": algoSignature,
            "OK-ACCESS-TIMESTAMP": algoTimestamp,
            "OK-ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json",
          };
          
          if (demo) {
            algoHeaders["x-simulated-trading"] = "1";
          }
          
          const algoResponse = await fetch(`${baseUrl}${algoPath}${algoQuery}`, {
            method: "GET",
            headers: algoHeaders,
          });

          const algoData = await algoResponse.json();

          if (algoData.code === "0" && algoData.data && algoData.data.length > 0) {
            console.log(`   Found ${algoData.data.length} algo orders to cancel`);
            
            for (const order of algoData.data) {
              try {
                const cancelTimestamp = new Date().toISOString();
                const cancelMethod = "POST";
                const cancelPath = "/api/v5/trade/cancel-algos";
                const cancelPayload = [{ algoId: order.algoId, instId: symbol }];
                const cancelBody = JSON.stringify(cancelPayload);
                
                const cancelSignature = signOkxRequest(cancelTimestamp, cancelMethod, cancelPath, cancelBody, apiSecret);
                
                const cancelHeaders: Record<string, string> = {
                  "OK-ACCESS-KEY": apiKey,
                  "OK-ACCESS-SIGN": cancelSignature,
                  "OK-ACCESS-TIMESTAMP": cancelTimestamp,
                  "OK-ACCESS-PASSPHRASE": passphrase,
                  "Content-Type": "application/json",
                };
                
                if (demo) {
                  cancelHeaders["x-simulated-trading"] = "1";
                }
                
                const cancelResponse = await fetch(`${baseUrl}${cancelPath}`, {
                  method: "POST",
                  headers: cancelHeaders,
                  body: cancelBody,
                });
                
                const cancelData = await cancelResponse.json();
                
                if (cancelData.code === "0") {
                  ordersCancelled++;
                  console.log(`   ✅ Cancelled order: ${order.algoId}`);
                } else {
                  console.warn(`   ⚠️ Failed to cancel ${order.algoId}: ${cancelData.msg}`);
                }
              } catch (cancelError: any) {
                console.error(`   ❌ Error cancelling ${order.algoId}:`, cancelError);
              }
            }
          } else {
            console.log(`   No algo orders to cancel for ${symbol}`);
          }
        } catch (ordersError: any) {
          console.error(`   ⚠️ Failed to cancel orders:`, ordersError.message);
          // Continue anyway - order cancellation is best-effort
        }
      }

      // NEW: Update bot_positions status in DB
      try {
        await db.update(botPositions)
          .set({
            status: "closed",
            closeReason: "manual_close",
            closedAt: new Date().toISOString()
          })
          .where(
            and(
              eq(botPositions.symbol, symbol),
              eq(botPositions.status, "open")
            )
          );
      } catch (dbError) {
        console.error(`   ⚠️ Failed to update DB for ${symbol}:`, dbError);
      }

      return NextResponse.json({
        success: true,
        message: `OKX position closed successfully${cancelOrders ? ` and ${ordersCancelled} orders cancelled` : ''}`,
        data: closeData.data,
        ordersCancelled
      });
    } catch (error) {
      console.error("Error closing OKX position:", error);
      return NextResponse.json(
        {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
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