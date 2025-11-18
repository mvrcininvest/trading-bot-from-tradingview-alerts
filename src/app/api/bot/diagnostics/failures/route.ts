import { NextResponse } from 'next/server';
import { db } from '@/db';
import { diagnosticFailures, botPositions } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

// GET /api/bot/diagnostics/failures - Get all diagnostic failures
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const failureType = searchParams.get('type');

    let query = db.select({
      failure: diagnosticFailures,
      position: botPositions
    })
      .from(diagnosticFailures)
      .leftJoin(botPositions, eq(diagnosticFailures.positionId, botPositions.id))
      .orderBy(desc(diagnosticFailures.createdAt))
      .limit(limit);

    const failures = await query;

    // Group by failure type
    const grouped = failures.reduce((acc, item) => {
      const type = item.failure.failureType;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(item);
      return acc;
    }, {} as Record<string, typeof failures>);

    return NextResponse.json({
      success: true,
      failures,
      grouped,
      totalCount: failures.length,
      emergencyCloses: failures.filter(f => f.failure.failureType === 'emergency_close').length,
      tpslFailures: failures.filter(f => f.failure.failureType === 'tpsl_set_failed').length,
      cleanupFailures: failures.filter(f => f.failure.failureType === 'order_cleanup_failed').length
    });
  } catch (error: any) {
    console.error('Failed to fetch diagnostic failures:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch failures' },
      { status: 500 }
    );
  }
}
