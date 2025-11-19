import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { diagnosticFailures, alerts, tpslRetryAttempts, botDetailedLogs, symbolLocks } from '@/db/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = body; // 'failures', 'error_alerts', 'verifications', 'retries', 'history_locks', 'all'

    let deletedCount = 0;
    let details: Record<string, number> = {};

    console.log(`🧹 Starting cleanup: ${type}`);

    switch (type) {
      case 'failures':
        // Wyczyść wszystkie awarie diagnostyczne
        const failuresResult = await db.delete(diagnosticFailures);
        deletedCount = failuresResult.rowsAffected || 0;
        details.failures = deletedCount;
        console.log(`   Deleted ${deletedCount} failures`);
        break;

      case 'error_alerts':
        // Wyczyść alerty z błędami (error_rejected)
        const alertsResult = await db.delete(alerts)
          .where(eq(alerts.executionStatus, 'error_rejected'));
        deletedCount = alertsResult.rowsAffected || 0;
        details.errorAlerts = deletedCount;
        console.log(`   Deleted ${deletedCount} error alerts`);
        break;

      case 'verifications':
        // Wyczyść nieudane weryfikacje (hasDiscrepancy = true)
        const verificationsResult = await db.delete(botDetailedLogs)
          .where(eq(botDetailedLogs.hasDiscrepancy, true));
        deletedCount = verificationsResult.rowsAffected || 0;
        details.verifications = deletedCount;
        console.log(`   Deleted ${deletedCount} failed verifications`);
        break;

      case 'retries':
        // Wyczyść wszystkie próby ponowne
        const retriesResult = await db.delete(tpslRetryAttempts);
        deletedCount = retriesResult.rowsAffected || 0;
        details.retries = deletedCount;
        console.log(`   Deleted ${deletedCount} retry attempts`);
        break;

      case 'history_locks':
        // ✅ FIX: Wyczyść tylko historię odblokowań (gdzie unlockedAt IS NOT NULL)
        const historyLocksResult = await db.delete(symbolLocks)
          .where(isNotNull(symbolLocks.unlockedAt));
        deletedCount = historyLocksResult.rowsAffected || 0;
        details.historyLocks = deletedCount;
        console.log(`   Deleted ${deletedCount} historical locks`);
        break;

      case 'all':
        // Wyczyść wszystko OPRÓCZ aktywnych blokad
        const f = await db.delete(diagnosticFailures);
        const a = await db.delete(alerts).where(eq(alerts.executionStatus, 'error_rejected'));
        const v = await db.delete(botDetailedLogs).where(eq(botDetailedLogs.hasDiscrepancy, true));
        const r = await db.delete(tpslRetryAttempts);
        // ✅ FIX: Historia odblokowań - tylko odblokowane symbole (unlockedAt IS NOT NULL)
        const h = await db.delete(symbolLocks).where(isNotNull(symbolLocks.unlockedAt));
        
        details = {
          failures: f.rowsAffected || 0,
          errorAlerts: a.rowsAffected || 0,
          verifications: v.rowsAffected || 0,
          retries: r.rowsAffected || 0,
          historyLocks: h.rowsAffected || 0,
        };
        deletedCount = Object.values(details).reduce((sum, val) => sum + val, 0);
        console.log(`   Deleted ${deletedCount} total records:`, details);
        break;

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid cleanup type' },
          { status: 400 }
        );
    }

    console.log(`✅ Cleanup complete: ${type}`);

    return NextResponse.json({
      success: true,
      message: `Wyczyszczono ${deletedCount} wpisów`,
      deletedCount,
      details,
    });
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return NextResponse.json(
      { success: false, error: 'Database cleanup failed' },
      { status: 500 }
    );
  }
}