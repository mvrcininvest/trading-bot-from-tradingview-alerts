import { NextResponse } from 'next/server';
import { db } from '@/db';
import { botDetailedLogs, botPositions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    // Fetch verification logs with position details
    const verifications = await db.select({
      log: botDetailedLogs,
      position: {
        symbol: botPositions.symbol,
        side: botPositions.side,
        tier: botPositions.tier,
      }
    })
      .from(botDetailedLogs)
      .leftJoin(botPositions, eq(botDetailedLogs.positionId, botPositions.id))
      .where(eq(botDetailedLogs.actionType, 'open_position'))
      .orderBy(desc(botDetailedLogs.createdAt))
      .limit(limit);

    return NextResponse.json({
      success: true,
      verifications
    });
  } catch (error: any) {
    console.error('Failed to fetch verifications:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
