import { NextResponse } from "next/server";
import { resetCloudFrontLock } from "@/lib/cloudfront-guard";

/**
 * POST /api/bot/reset-cloudfront-lock
 * Reset CloudFront lock to allow new connection attempts
 */
export async function POST() {
  try {
    console.log("[Reset CloudFront Lock] Resetting lock...");
    
    await resetCloudFrontLock();
    
    console.log("✅ CloudFront lock reset successfully");
    
    return NextResponse.json({
      success: true,
      message: "CloudFront lock został zresetowany. Możesz teraz przetestować połączenie ponownie."
    });
  } catch (error: any) {
    console.error("[Reset CloudFront Lock] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: `Błąd podczas resetowania lock-a: ${error.message}`
      },
      { status: 500 }
    );
  }
}
