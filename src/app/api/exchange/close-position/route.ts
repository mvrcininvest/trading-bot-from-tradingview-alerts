import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

      return NextResponse.json({
        success: true,
        message: "OKX position closed successfully",
        data: closeData.data,
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