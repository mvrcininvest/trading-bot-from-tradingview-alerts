import { NextResponse } from 'next/server';
import { db } from '@/db';
import { tpslRetryAttempts, botPositions } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

// GET /api/bot/diagnostics/retry-attempts - Get all TP/SL retry attempts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const positionId = searchParams.get('positionId');

    // ✅ Build query with proper order: select -> from -> join -> where -> orderBy -> limit
    let query = db.select({
      attempt: tpslRetryAttempts,
      position: botPositions
    })
      .from(tpslRetryAttempts)
      .leftJoin(botPositions, eq(tpslRetryAttempts.positionId, botPositions.id));

    // ✅ Apply where condition BEFORE limit
    if (positionId) {
      query = query.where(eq(tpslRetryAttempts.positionId, parseInt(positionId)));
    }

    // ✅ Apply orderBy and limit at the end
    const attempts = await query
      .orderBy(desc(tpslRetryAttempts.createdAt))
      .limit(limit);

    // Group by position
    const byPosition = attempts.reduce((acc, item) => {
      const posId = item.attempt.positionId;
      if (!acc[posId]) {
        acc[posId] = [];
      }
      acc[posId].push(item);
      return acc;
    }, {} as Record<number, typeof attempts>);

    // Count failures
    const failedAttempts = attempts.filter(a => a.attempt.errorMessage !== null);
    const successfulAttempts = attempts.filter(a => a.attempt.errorMessage === null);

    return NextResponse.json({
      success: true,
      attempts,
      byPosition,
      totalCount: attempts.length,
      failedCount: failedAttempts.length,
      successfulCount: successfulAttempts.length,
      failureRate: attempts.length > 0 ? (failedAttempts.length / attempts.length * 100).toFixed(2) : '0'
    });
  } catch (error: any) {
    console.error('Failed to fetch retry attempts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch retry attempts' },
      { status: 500 }
    );
  }
}