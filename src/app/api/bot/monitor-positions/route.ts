import { NextResponse } from "next/server";
import { monitorAllPositions } from "@/lib/position-monitor";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// ✅ Support both POST (for cron-job.org/EasyCron) and GET (for UptimeRobot)
export async function POST() {
  return handleMonitor();
}

export async function GET() {
  return handleMonitor();
}

async function handleMonitor() {
  try {
    console.log("🔍 [Cron] Starting position monitor...");
    
    const result = await monitorAllPositions();
    
    console.log("✅ [Cron] Monitor completed:", result);
    
    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ [Cron] Monitor failed:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}