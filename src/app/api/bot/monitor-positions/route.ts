import { NextRequest, NextResponse } from 'next/server';
import { monitorAndManagePositions } from '@/lib/position-monitor';

export async function POST(request: NextRequest) {
  try {
    console.log("\n🔍 Starting position monitoring via API endpoint...");
    
    const result = await monitorAndManagePositions(false);
    
    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: `Monitor failed: ${result.reason || result.error}`,
        result,
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      message: "Position monitoring completed",
      result,
    });
    
  } catch (error) {
    console.error("❌ Monitor API error:", error);
    return NextResponse.json({
      success: false,
      message: `Monitor failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'online',
    message: 'Position Monitor Endpoint',
    description: 'Monitors positions for TP hits, manages partial closes, and fixes missing SL/TP algo orders',
    features: [
      'Checks if TP1/TP2/TP3 prices hit',
      'Partially closes positions at each TP (based on tp1Percent, tp2Percent, tp3Percent)',
      'Adjusts SL after TP1 (breakeven, trailing, or no change)',
      'Detects missing SL/TP algo orders and adds them',
      'Only adds SL/TP if position truly needs it (checks existing algo orders)',
    ],
  });
}
