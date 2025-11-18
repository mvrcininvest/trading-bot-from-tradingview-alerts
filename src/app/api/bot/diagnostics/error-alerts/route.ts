import { NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

// GET /api/bot/diagnostics/error-alerts - Get all error_rejected alerts
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const errorAlerts = await db.select()
      .from(alerts)
      .where(eq(alerts.executionStatus, 'error_rejected'))
      .orderBy(desc(alerts.createdAt))
      .limit(limit);

    // Group by error type
    const grouped = errorAlerts.reduce((acc, alert) => {
      const type = alert.errorType || 'unknown';
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(alert);
      return acc;
    }, {} as Record<string, typeof errorAlerts>);

    // Count by rejection reason
    const reasonCounts = errorAlerts.reduce((acc, alert) => {
      const reason = alert.rejectionReason || 'unknown';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      errorAlerts,
      grouped,
      reasonCounts,
      totalCount: errorAlerts.length,
      apiTemporary: errorAlerts.filter(a => a.errorType === 'api_temporary').length,
      tradeFault: errorAlerts.filter(a => a.errorType === 'trade_fault').length,
      configurationError: errorAlerts.filter(a => a.errorType === 'configuration_missing' || a.errorType === 'configuration_error').length
    });
  } catch (error: any) {
    console.error('Failed to fetch error alerts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch error alerts' },
      { status: 500 }
    );
  }
}
