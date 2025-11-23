import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';
import { and, lt, sql } from 'drizzle-orm';

/**
 * Cleanup old alerts based on retentionDays
 * Default: Remove alerts older than their retentionDays (default 30 days)
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    
    console.log(`[Cleanup] Starting alert cleanup (dryRun: ${dryRun})...`);
    
    // Calculate cutoff date (alerts older than their retention period)
    const now = new Date();
    
    // Find alerts to delete
    // Alert should be deleted if: createdAt + retentionDays < now
    const alertsToDelete = await db
      .select()
      .from(alerts)
      .where(
        sql`datetime(${alerts.createdAt}, '+' || ${alerts.retentionDays} || ' days') < datetime('now')`
      );
    
    console.log(`[Cleanup] Found ${alertsToDelete.length} alerts to delete`);
    
    if (dryRun) {
      // Dry run - just report what would be deleted
      const preview = alertsToDelete.slice(0, 10).map(alert => ({
        id: alert.id,
        symbol: alert.symbol,
        tier: alert.tier,
        createdAt: alert.createdAt,
        retentionDays: alert.retentionDays,
        age: Math.floor((now.getTime() - new Date(alert.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      }));
      
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: `Would delete ${alertsToDelete.length} alerts`,
        count: alertsToDelete.length,
        preview
      });
    }
    
    // Actually delete the alerts
    if (alertsToDelete.length > 0) {
      const idsToDelete = alertsToDelete.map(a => a.id);
      
      // Delete in batches of 1000
      const batchSize = 1000;
      let deletedCount = 0;
      
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        
        await db
          .delete(alerts)
          .where(sql`${alerts.id} IN (${sql.join(batch.map(id => sql`${id}`), sql`, `)})`);
        
        deletedCount += batch.length;
        console.log(`[Cleanup] Deleted batch: ${deletedCount}/${idsToDelete.length}`);
      }
      
      console.log(`[Cleanup] ✅ Successfully deleted ${deletedCount} alerts`);
      
      return NextResponse.json({
        success: true,
        message: `Successfully deleted ${deletedCount} old alerts`,
        deletedCount,
        deletedAt: now.toISOString()
      });
    } else {
      console.log('[Cleanup] No alerts to delete');
      
      return NextResponse.json({
        success: true,
        message: 'No old alerts found to delete',
        deletedCount: 0
      });
    }
    
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET endpoint to check how many alerts would be deleted
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    
    // Find alerts that would be deleted
    const alertsToDelete = await db
      .select()
      .from(alerts)
      .where(
        sql`datetime(${alerts.createdAt}, '+' || ${alerts.retentionDays} || ' days') < datetime('now')`
      );
    
    // Group by retention days
    const groupedByRetention = new Map<number, number>();
    alertsToDelete.forEach(alert => {
      const retention = alert.retentionDays;
      groupedByRetention.set(retention, (groupedByRetention.get(retention) || 0) + 1);
    });
    
    const breakdown = Array.from(groupedByRetention.entries()).map(([days, count]) => ({
      retentionDays: days,
      count
    }));
    
    return NextResponse.json({
      success: true,
      totalAlertsToDelete: alertsToDelete.length,
      breakdown,
      message: `${alertsToDelete.length} alerts are eligible for deletion`
    });
    
  } catch (error) {
    console.error('[Cleanup Check] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
