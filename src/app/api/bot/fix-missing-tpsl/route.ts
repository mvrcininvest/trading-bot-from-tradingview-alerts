import { NextRequest, NextResponse } from 'next/server';
import { monitorAndManagePositions } from '@/lib/position-monitor';

export async function POST(request: NextRequest) {
  try {
    console.log("\n🔧 Starting fix-missing-tpsl process (using new monitor)...");

    const result = await monitorAndManagePositions(false);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        message: `Monitor failed: ${result.reason || result.error}`,
        result,
      }, { status: 400 });
    }

    console.log("\n✅ Fix-missing-tpsl process completed");
    console.log(`   Checked: ${result.checked}`);
    console.log(`   TP Hits: ${result.tpHits}`);
    console.log(`   SL Adjustments: ${result.slAdjustments}`);
    console.log(`   SL/TP Fixed: ${result.slTpFixed}`);

    return NextResponse.json({
      success: true,
      message: "Process completed",
      results: {
        checked: result.checked,
        fixed: result.slTpFixed || 0,
        closed: (result.tpHits || 0),
        skipped: 0,
        errors: [],
        details: [],
        tpHits: result.tpHits,
        slAdjustments: result.slAdjustments,
      },
    });

  } catch (error) {
    console.error("❌ Fix-missing-tpsl error:", error);
    return NextResponse.json({
      success: false,
      message: `Process failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}