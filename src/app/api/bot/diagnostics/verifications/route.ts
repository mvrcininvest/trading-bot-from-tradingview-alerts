import { NextResponse } from "next/server";
import { db } from "@/db";
import { positionVerifications, botPositions } from "@/db/schema";
import { desc, eq, gte } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const startDateParam = searchParams.get("startDate");
    
    const limit = limitParam ? parseInt(limitParam) : 50;

    let query = db
      .select({
        log: positionVerifications,
        position: {
          symbol: botPositions.symbol,
          side: botPositions.side,
          tier: botPositions.tier,
        },
      })
      .from(positionVerifications)
      .leftJoin(botPositions, eq(positionVerifications.positionId, botPositions.id))
      .orderBy(desc(positionVerifications.timestamp));

    // ✅ Filter by start date if provided (for daily filtering)
    if (startDateParam) {
      query = query.where(gte(positionVerifications.timestamp, startDateParam)) as any;
    }

    const verifications = await query.limit(limit);

    return NextResponse.json({
      success: true,
      verifications,
      count: verifications.length,
    });
  } catch (error: any) {
    console.error("[API] Failed to get verifications:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get verifications",
      },
      { status: 500 }
    );
  }
}