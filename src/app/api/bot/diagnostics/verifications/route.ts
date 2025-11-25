import { NextResponse } from "next/server";
import { db } from "@/db";
import { botDetailedLogs, botPositions } from "@/db/schema";
import { desc, eq, gte } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const startDateParam = searchParams.get("startDate");
    
    const limit = limitParam ? parseInt(limitParam) : 50;

    let query = db
      .select({
        log: botDetailedLogs,
        position: {
          symbol: botPositions.symbol,
          side: botPositions.side,
          tier: botPositions.tier,
        },
      })
      .from(botDetailedLogs)
      .leftJoin(botPositions, eq(botDetailedLogs.positionId, botPositions.id))
      .orderBy(desc(botDetailedLogs.timestamp));

    // ✅ Filter by start date if provided (for daily filtering)
    if (startDateParam) {
      query = query.where(gte(botDetailedLogs.timestamp, startDateParam)) as any;
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