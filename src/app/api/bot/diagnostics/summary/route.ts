import { NextResponse } from 'next/server';
import { db } from '@/db';
import { symbolLocks, diagnosticFailures, alerts, tpslRetryAttempts } from '@/db/schema';
import { eq, isNull, gte } from 'drizzle-orm';

// GET /api/bot/diagnostics/summary - Get diagnostic summary
export async function GET() {
  try {
    // Get active locks
    const activeLocks = await db.select()
      .from(symbolLocks)
      .where(isNull(symbolLocks.unlockedAt));

    // Get total failures
    const failures = await db.select()
      .from(diagnosticFailures);

    // Get error_rejected alerts
    const errorAlerts = await db.select()
      .from(alerts)
      .where(eq(alerts.executionStatus, 'error_rejected'));

    // Get recent retry attempts (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentRetries = await db.select()
      .from(tpslRetryAttempts)
      .where(gte(tpslRetryAttempts.createdAt, oneDayAgo));

    // Calculate stats
    const failedRetries = recentRetries.filter(r => r.errorMessage !== null);
    const retryFailureRate = recentRetries.length > 0 
      ? (failedRetries.length / recentRetries.length * 100).toFixed(2)
      : '0';

    return NextResponse.json({
      success: true,
      summary: {
        activeSymbolLocks: activeLocks.length,
        totalSymbolLocks: await db.select().from(symbolLocks).then(r => r.length),
        totalDiagnosticFailures: failures.length,
        emergencyCloses: failures.filter(f => f.failureType === 'emergency_close').length,
        totalErrorAlerts: errorAlerts.length,
        apiTemporaryErrors: errorAlerts.filter(a => a.errorType === 'api_temporary').length,
        tradeFaultErrors: errorAlerts.filter(a => a.errorType === 'trade_fault').length,
        recentRetryAttempts: recentRetries.length,
        retryFailureRate: `${retryFailureRate}%`
      },
      activeLocks: activeLocks.map(lock => ({
        symbol: lock.symbol,
        reason: lock.lockReason,
        lockedAt: lock.lockedAt,
        failureCount: lock.failureCount
      }))
    });
  } catch (error: any) {
    console.error('Failed to fetch diagnostic summary:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}