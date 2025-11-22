import { NextRequest, NextResponse } from 'next/server';
import { openBybitPosition, getCurrentMarketPrice } from '@/lib/bybit-helpers';

// ============================================
// 📨 POST ENDPOINT - OPEN POSITION (BYBIT ONLY)
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      exchange,
      apiKey,
      apiSecret,
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

    // Only support Bybit
    if (exchange !== "bybit") {
      return NextResponse.json({
        success: false,
        error: "Only Bybit mainnet is supported.",
        code: "UNSUPPORTED_EXCHANGE"
      }, { status: 400 });
    }

    if (side !== "Buy" && side !== "Sell" && side !== "buy" && side !== "sell" && side !== "BUY" && side !== "SELL") {
      return NextResponse.json({
        success: false,
        error: 'Side must be "Buy" or "Sell"',
        code: "INVALID_SIDE"
      }, { status: 400 });
    }

    console.log(`\n🚀 Opening Bybit position:`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Side: ${side}`);
    console.log(`   Quantity: ${quantity}`);
    console.log(`   Leverage: ${leverage}x`);
    console.log(`   TP: ${takeProfit || tp1 || 'N/A'}`);
    console.log(`   SL: ${stopLoss || 'N/A'}`);

    const result = await openBybitPosition(
      symbol,
      side,
      parseFloat(quantity),
      parseInt(leverage || '10'),
      apiKey,
      apiSecret,
      takeProfit ? parseFloat(takeProfit) : (tp1 ? parseFloat(tp1) : undefined),
      stopLoss ? parseFloat(stopLoss) : undefined
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