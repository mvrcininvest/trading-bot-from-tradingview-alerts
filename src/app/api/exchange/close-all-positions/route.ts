import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { botPositions } from "@/db/schema";
import { eq } from "drizzle-orm";

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
// 📨 POST ENDPOINT - CLOSE ALL POSITIONS
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
    } = body;

    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Only support OKX
    if (exchange !== "okx") {
      return NextResponse.json(
        { success: false, message: "Only OKX is supported" },
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

    const results = {
      positionsClosed: 0,
      ordersCancelled: 0,
      errors: [] as string[],
      details: [] as any[]
    };

    try {
      // ============================================
      // STEP 1: Get all open positions
      // ============================================
      console.log("\n🔍 Fetching all open positions...");
      
      const timestamp = new Date().toISOString();
      const method = "GET";
      const requestPath = "/api/v5/account/positions";
      const queryString = "?instType=SWAP";
      const body = "";
      
      const signature = signOkxRequest(
        timestamp,
        method,
        requestPath + queryString,
        body,
        apiSecret
      );
      
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
      
      const positionsResponse = await fetch(`${baseUrl}${requestPath}${queryString}`, {
        method: "GET",
        headers,
      });

      const positionsData = await positionsResponse.json();

      if (positionsData.code !== "0") {
        return NextResponse.json(
          {
            success: false,
            message: `Failed to fetch positions: ${positionsData.msg}`,
          },
          { status: 400 }
        );
      }

      // Filter only open positions
      const openPositions = positionsData.data.filter((p: any) => parseFloat(p.pos) !== 0);
      
      console.log(`   Found ${openPositions.length} open positions`);

      // ============================================
      // STEP 2: Close each position
      // ============================================
      for (const position of openPositions) {
        try {
          const symbol = position.instId;
          const pos = parseFloat(position.pos);
          
          console.log(`\n📉 Closing position: ${symbol} (${pos > 0 ? 'LONG' : 'SHORT'})`);
          
          const closeTimestamp = new Date().toISOString();
          const closeMethod = "POST";
          const closePath = "/api/v5/trade/close-position";
          
          const closePayload = {
            instId: symbol,
            mgnMode: "cross",
          };

          const closeBody = JSON.stringify(closePayload);
          const closeSignature = signOkxRequest(closeTimestamp, closeMethod, closePath, closeBody, apiSecret);

          const closeHeaders: Record<string, string> = {
            "OK-ACCESS-KEY": apiKey,
            "OK-ACCESS-SIGN": closeSignature,
            "OK-ACCESS-TIMESTAMP": closeTimestamp,
            "OK-ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json",
          };

          if (demo) {
            closeHeaders["x-simulated-trading"] = "1";
          }

          const closeResponse = await fetch(`${baseUrl}${closePath}`, {
            method: "POST",
            headers: closeHeaders,
            body: closeBody,
          });

          const closeData = await closeResponse.json();

          if (closeData.code === "0") {
            results.positionsClosed++;
            results.details.push({
              symbol,
              action: "closed",
              success: true
            });
            console.log(`   ✅ Position closed: ${symbol}`);
            
            // Update bot_positions status in DB
            try {
              const side = pos > 0 ? "BUY" : "SELL";
              await db.update(botPositions)
                .set({
                  status: "closed",
                  closeReason: "manual_close_all",
                  closedAt: new Date().toISOString()
                })
                .where(eq(botPositions.symbol, symbol))
                .where(eq(botPositions.side, side))
                .where(eq(botPositions.status, "open"));
            } catch (dbError) {
              console.error(`   ⚠️ Failed to update DB for ${symbol}:`, dbError);
            }
          } else {
            results.errors.push(`Failed to close ${symbol}: ${closeData.msg}`);
            results.details.push({
              symbol,
              action: "close_failed",
              error: closeData.msg
            });
            console.error(`   ❌ Failed to close ${symbol}: ${closeData.msg}`);
          }
        } catch (posError: any) {
          results.errors.push(`Error closing ${position.instId}: ${posError.message}`);
          console.error(`   ❌ Error closing ${position.instId}:`, posError);
        }
      }

      // ============================================
      // STEP 3: Cancel all algo orders (SL/TP)
      // ============================================
      console.log("\n🧹 Fetching all algo orders...");
      
      const algoTimestamp = new Date().toISOString();
      const algoMethod = "GET";
      const algoPath = "/api/v5/trade/orders-algo-pending";
      const algoQuery = "?ordType=conditional";
      
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
            const cancelPayload = [{ algoId: order.algoId, instId: order.instId }];
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
              results.ordersCancelled++;
              console.log(`   ✅ Cancelled order: ${order.algoId} for ${order.instId}`);
            } else {
              results.errors.push(`Failed to cancel order ${order.algoId}: ${cancelData.msg}`);
              console.warn(`   ⚠️ Failed to cancel ${order.algoId}: ${cancelData.msg}`);
            }
          } catch (cancelError: any) {
            results.errors.push(`Error cancelling order ${order.algoId}: ${cancelError.message}`);
            console.error(`   ❌ Error cancelling ${order.algoId}:`, cancelError);
          }
        }
      } else {
        console.log("   No algo orders to cancel");
      }

      // ============================================
      // STEP 4: Return results
      // ============================================
      return NextResponse.json({
        success: true,
        message: `Closed ${results.positionsClosed} positions and cancelled ${results.ordersCancelled} orders`,
        results
      });

    } catch (error: any) {
      console.error("Error in close-all-positions:", error);
      return NextResponse.json(
        {
          success: false,
          message: error.message || "Unknown error",
          results
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in close-all-positions endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
