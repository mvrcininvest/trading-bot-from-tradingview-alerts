import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Bybit API endpoint for historical klines
const BYBIT_API_URL = "https://api.bybit.com";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get("symbol");
    const startTime = searchParams.get("startTime"); // openedAt timestamp
    const endTime = searchParams.get("endTime"); // closedAt timestamp
    const interval = searchParams.get("interval") || "5"; // 5 minutes default

    if (!symbol || !startTime || !endTime) {
      return NextResponse.json(
        { success: false, message: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Convert to milliseconds and add buffer (1 hour before/after)
    const bufferMs = 60 * 60 * 1000; // 1 hour
    const start = parseInt(startTime) - bufferMs;
    const end = parseInt(endTime) + bufferMs;

    // Fetch kline data from Bybit
    const url = `${BYBIT_API_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&start=${start}&end=${end}&limit=200`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (data.retCode !== 0) {
      return NextResponse.json(
        { success: false, message: data.retMsg || "Bybit API error" },
        { status: 400 }
      );
    }

    // Transform Bybit kline data to lightweight-charts format
    const chartData = data.result.list.map((k: any) => ({
      time: parseInt(k[0]) / 1000, // Convert to seconds
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    })).reverse(); // Bybit returns newest first, we need oldest first

    return NextResponse.json({
      success: true,
      data: chartData,
    });
  } catch (error: any) {
    console.error("Chart data API error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}