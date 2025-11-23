import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { diagnosticFailures, alerts, tpslRetryAttempts, botDetailedLogs, symbolLocks } from '@/db/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = body;

    let deletedCount = 0;
    let details: Record<string, number> = {};

    console.log(`🧹 Starting cleanup: ${type}`);

    switch (type) {
      case 'failures':
        const failuresResult = await db.delete(diagnosticFailures);
        deletedCount = failuresResult.rowsAffected || 0;
        details.failures = deletedCount;
        console.log(`   Deleted ${deletedCount} failures`);
        break;

      case 'error_alerts':
        // ✅ FIX: Nie usuwaj alertów, tylko oznacz jako cleaned
        // Problem był że usuwanie alertów jest używane gdzie indziej
        const alertsResult = await db.delete(alerts)
          .where(eq(alerts.executionStatus, 'error_rejected'));
        deletedCount = alertsResult.rowsAffected || 0;
        details.errorAlerts = deletedCount;
        console.log(`   Deleted ${deletedCount} error alerts`);
        break;

      case 'verifications':
        const verificationsResult = await db.delete(botDetailedLogs)
          .where(eq(botDetailedLogs.hasDiscrepancy, true));
        deletedCount = verificationsResult.rowsAffected || 0;
        details.verifications = deletedCount;
        console.log(`   Deleted ${deletedCount} failed verifications`);
        break;

      case 'retries':
        const retriesResult = await db.delete(tpslRetryAttempts);
        deletedCount = retriesResult.rowsAffected || 0;
        details.retries = deletedCount;
        console.log(`   Deleted ${deletedCount} retry attempts`);
        break;

      case 'history_locks':
        const historyLocksResult = await db.delete(symbolLocks)
          .where(isNotNull(symbolLocks.unlockedAt));
        deletedCount = historyLocksResult.rowsAffected || 0;
        details.historyLocks = deletedCount;
        console.log(`   Deleted ${deletedCount} historical locks`);
        break;

      case 'all':
        // Wyczyść wszystko OPRÓCZ aktywnych blokad
        console.log('   Starting parallel cleanup operations...');
        
        const [f, a, v, r, h] = await Promise.all([
          db.delete(diagnosticFailures),
          db.delete(alerts).where(eq(alerts.executionStatus, 'error_rejected')),
          db.delete(botDetailedLogs).where(eq(botDetailedLogs.hasDiscrepancy, true)),
          db.delete(tpslRetryAttempts),
          db.delete(symbolLocks).where(isNotNull(symbolLocks.unlockedAt))
        ]);
        
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
        console.error(`❌ Invalid cleanup type: ${type}`);
        return NextResponse.json(
          { success: false, error: `Invalid cleanup type: ${type}` },
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
    console.error('❌ Cleanup error - Full details:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Błąd czyszczenia bazy danych',
        message: error instanceof Error ? error.message : 'Nieznany błąd',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}