import { NextResponse } from "next/server";
import { db } from "@/db";
import { botSettings } from "@/db/schema";

/**
 * GET /api/bot/cloudfront-lock-status
 * Check if CloudFront lock is active
 */
export async function GET() {
  try {
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0) {
      return NextResponse.json({
        success: true,
        lockActive: false,
        message: "No settings found - lock not active"
      });
    }
    
    const isDisabled = !settings[0].botEnabled;
    const hasCloudFrontFlag = settings[0].migrationDate?.includes('CLOUDFRONT_LOCK') ?? false;
    const lockActive = isDisabled && hasCloudFrontFlag;
    
    return NextResponse.json({
      success: true,
      lockActive,
      botEnabled: settings[0].botEnabled,
      lockSetAt: hasCloudFrontFlag ? settings[0].migrationDate : null,
      message: lockActive 
        ? "CloudFront lock is ACTIVE - bot disabled for safety"
        : "No CloudFront lock - bot can operate normally"
    });
  } catch (error: any) {
    console.error("[CloudFront Lock Status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message
      },
      { status: 500 }
    );
  }
}
