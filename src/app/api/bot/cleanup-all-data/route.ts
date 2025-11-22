import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  alerts,
  botPositions,
  positionHistory,
  botActions,
  botLogs,
  diagnosticFailures,
  tpslRetryAttempts,
  botDetailedLogs,
  symbolLocks,
  activePositionTracking,
  positionConflictLog,
  positionGuardLogs,
  positionGuardActions,
  capitulationCounter
} from '@/db/schema';
import { isNotNull, eq } from 'drizzle-orm';

/**
 * POST /api/bot/cleanup-all-data
 * 
 * KOMPLEKSOWE CZYSZCZENIE WSZYSTKICH DANYCH HISTORYCZNYCH
 * Usuwa:
 * - Wszystkie alerty
 * - Wszystkie pozycje (otwarte i zamknięte)
 * - Całą historię pozycji
 * - Wszystkie logi bota
 * - Wszystkie akcje bota
 * - Diagnostykę (awarie, błędy, weryfikacje, retry)
 * - Tracking pozycji
 * - Logi konfliktów
 * - Guard logs i akcje
 * - Reset countera kapitulacji
 * - Historię odblokowań symboli (aktywne blokady pozostają!)
 * 
 * ZACHOWUJE:
 * - Ustawienia bota (bot_settings)
 * - Aktywne blokady symboli (symbol_locks gdzie unlockedAt IS NULL)
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🧹 === ROZPOCZĘCIE KOMPLEKSOWEGO CZYSZCZENIA DANYCH ===');
    
    const results: Record<string, number> = {};
    let totalDeleted = 0;

    // 1. Kapitulacja counter - reset
    console.log('🔄 Resetowanie kapitulacji counter...');
    const capResult = await db.delete(capitulationCounter);
    results.capitulationCounter = capResult.rowsAffected || 0;
    totalDeleted += results.capitulationCounter;
    console.log(`   ✓ Reset: ${results.capitulationCounter}`);

    // 2. Position Guard Actions
    console.log('🗑️  Czyszczenie position guard actions...');
    const guardActionsResult = await db.delete(positionGuardActions);
    results.guardActions = guardActionsResult.rowsAffected || 0;
    totalDeleted += results.guardActions;
    console.log(`   ✓ Usunięto: ${results.guardActions}`);

    // 3. Position Guard Logs
    console.log('🗑️  Czyszczenie position guard logs...');
    const guardLogsResult = await db.delete(positionGuardLogs);
    results.guardLogs = guardLogsResult.rowsAffected || 0;
    totalDeleted += results.guardLogs;
    console.log(`   ✓ Usunięto: ${results.guardLogs}`);

    // 4. Position Conflict Log
    console.log('🗑️  Czyszczenie conflict logs...');
    const conflictResult = await db.delete(positionConflictLog);
    results.conflictLogs = conflictResult.rowsAffected || 0;
    totalDeleted += results.conflictLogs;
    console.log(`   ✓ Usunięto: ${results.conflictLogs}`);

    // 5. Active Position Tracking
    console.log('🗑️  Czyszczenie active position tracking...');
    const trackingResult = await db.delete(activePositionTracking);
    results.positionTracking = trackingResult.rowsAffected || 0;
    totalDeleted += results.positionTracking;
    console.log(`   ✓ Usunięto: ${results.positionTracking}`);

    // 6. Bot Detailed Logs (weryfikacje)
    console.log('🗑️  Czyszczenie detailed logs (weryfikacje)...');
    const detailedLogsResult = await db.delete(botDetailedLogs);
    results.detailedLogs = detailedLogsResult.rowsAffected || 0;
    totalDeleted += results.detailedLogs;
    console.log(`   ✓ Usunięto: ${results.detailedLogs}`);

    // 7. TPSL Retry Attempts
    console.log('🗑️  Czyszczenie retry attempts...');
    const retryResult = await db.delete(tpslRetryAttempts);
    results.retryAttempts = retryResult.rowsAffected || 0;
    totalDeleted += results.retryAttempts;
    console.log(`   ✓ Usunięto: ${results.retryAttempts}`);

    // 8. Diagnostic Failures
    console.log('🗑️  Czyszczenie diagnostic failures...');
    const failuresResult = await db.delete(diagnosticFailures);
    results.diagnosticFailures = failuresResult.rowsAffected || 0;
    totalDeleted += results.diagnosticFailures;
    console.log(`   ✓ Usunięto: ${results.diagnosticFailures}`);

    // 9. Symbol Locks - TYLKO HISTORIA (unlockedAt IS NOT NULL)
    console.log('🗑️  Czyszczenie historii odblokowań...');
    const locksResult = await db.delete(symbolLocks)
      .where(isNotNull(symbolLocks.unlockedAt));
    results.symbolLocksHistory = locksResult.rowsAffected || 0;
    totalDeleted += results.symbolLocksHistory;
    console.log(`   ✓ Usunięto: ${results.symbolLocksHistory} (aktywne blokady zachowane)`);

    // 10. Bot Logs
    console.log('🗑️  Czyszczenie bot logs...');
    const logsResult = await db.delete(botLogs);
    results.botLogs = logsResult.rowsAffected || 0;
    totalDeleted += results.botLogs;
    console.log(`   ✓ Usunięto: ${results.botLogs}`);

    // 11. Bot Actions
    console.log('🗑️  Czyszczenie bot actions...');
    const actionsResult = await db.delete(botActions);
    results.botActions = actionsResult.rowsAffected || 0;
    totalDeleted += results.botActions;
    console.log(`   ✓ Usunięto: ${results.botActions}`);

    // 12. Position History
    console.log('🗑️  Czyszczenie position history...');
    const historyResult = await db.delete(positionHistory);
    results.positionHistory = historyResult.rowsAffected || 0;
    totalDeleted += results.positionHistory;
    console.log(`   ✓ Usunięto: ${results.positionHistory}`);

    // 13. Bot Positions (wszystkie - otwarte i zamknięte)
    console.log('🗑️  Czyszczenie bot positions...');
    const positionsResult = await db.delete(botPositions);
    results.botPositions = positionsResult.rowsAffected || 0;
    totalDeleted += results.botPositions;
    console.log(`   ✓ Usunięto: ${results.botPositions}`);

    // 14. Alerts (wszystkie)
    console.log('🗑️  Czyszczenie alerts...');
    const alertsResult = await db.delete(alerts);
    results.alerts = alertsResult.rowsAffected || 0;
    totalDeleted += results.alerts;
    console.log(`   ✓ Usunięto: ${results.alerts}`);

    console.log('');
    console.log('✅ === CZYSZCZENIE ZAKOŃCZONE POMYŚLNIE ===');
    console.log(`📊 Łącznie usunięto: ${totalDeleted} rekordów`);
    console.log('');
    console.log('📋 Szczegóły:');
    Object.entries(results).forEach(([key, count]) => {
      if (count > 0) {
        console.log(`   - ${key}: ${count}`);
      }
    });
    console.log('');
    console.log('✅ System gotowy do zbierania nowych danych z Bybit Mainnet!');

    return NextResponse.json({
      success: true,
      message: '✅ Wszystkie dane historyczne zostały wyczyszczone. System gotowy na nowe dane z mainnet!',
      totalDeleted,
      details: results,
      preserved: {
        botSettings: 'Zachowane',
        activeSymbolLocks: 'Zachowane (tylko historia usunięta)'
      }
    });

  } catch (error) {
    console.error('❌ BŁĄD PODCZAS CZYSZCZENIA:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Błąd podczas czyszczenia danych',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
