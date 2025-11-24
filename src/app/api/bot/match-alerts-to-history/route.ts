import { NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory, alerts } from '@/db/schema';
import { isNull, eq, and, between, or } from 'drizzle-orm';

/**
 * 🔗 AUTO-MATCH ALERTS TO HISTORY POSITIONS
 * 
 * Automatically matches alerts to positions in history based on:
 * 1. Symbol (must match exactly)
 * 2. Timestamp (openedAt vs alert timestamp - max 10s difference)
 * 3. Side (must match if both available)
 * 
 * Note: We don't filter by alert status because position in history
 * means the alert was actually executed (status might change later)
 */

export async function POST() {
  try {
    console.log('[Match Alerts] Starting auto-match process...');

    // Step 1: Get all positions without alert data
    const positionsWithoutAlerts = await db.select()
      .from(positionHistory)
      .where(
        or(
          isNull(positionHistory.alertData),
          eq(positionHistory.alertData, ''),
          isNull(positionHistory.alertId)
        )
      );

    console.log(`[Match Alerts] Found ${positionsWithoutAlerts.length} positions without alert data`);

    if (positionsWithoutAlerts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Wszystkie pozycje mają już przypisane alerty',
        matched: 0,
        unmatched: 0,
        total: 0
      });
    }

    // Step 2: Get ALL alerts (not just accepted - position in history means it was executed)
    const allAlerts = await db.select()
      .from(alerts);

    console.log(`[Match Alerts] Found ${allAlerts.length} total alerts in database`);

    // Step 3: Match positions to alerts
    let matchedCount = 0;
    let unmatchedCount = 0;
    const matchDetails: any[] = [];

    for (const position of positionsWithoutAlerts) {
      const positionOpenTime = new Date(position.openedAt).getTime();
      
      // Find matching alert:
      // 1. Same symbol
      // 2. Timestamp within ±10 seconds of position open time (increased from 5s)
      // 3. Side matches (case-insensitive comparison)
      const matchingAlert = allAlerts.find(alert => {
        const alertTime = alert.timestamp;
        const timeDiff = Math.abs(positionOpenTime - alertTime);
        
        // Symbol must match
        if (alert.symbol !== position.symbol) return false;
        
        // Time difference must be ≤10 seconds (10000ms) - increased window
        if (timeDiff > 10000) return false;
        
        // Side should match (case-insensitive if both are available)
        if (alert.side && position.side) {
          if (alert.side.toUpperCase() !== position.side.toUpperCase()) return false;
        }
        
        return true;
      });

      if (matchingAlert) {
        // Build alert data JSON
        const alertData = JSON.stringify({
          symbol: matchingAlert.symbol,
          side: matchingAlert.side,
          tier: matchingAlert.tier,
          strength: matchingAlert.strength,
          entryPrice: matchingAlert.entryPrice,
          sl: matchingAlert.sl,
          tp1: matchingAlert.tp1,
          tp2: matchingAlert.tp2,
          tp3: matchingAlert.tp3,
          mainTp: matchingAlert.mainTp,
          atr: matchingAlert.atr,
          volumeRatio: matchingAlert.volumeRatio,
          session: matchingAlert.session,
          regime: matchingAlert.regime,
          regimeConfidence: matchingAlert.regimeConfidence,
          mtfAgreement: matchingAlert.mtfAgreement,
          leverage: matchingAlert.leverage,
          inOb: matchingAlert.inOb,
          inFvg: matchingAlert.inFvg,
          obScore: matchingAlert.obScore,
          fvgScore: matchingAlert.fvgScore,
          institutionalFlow: matchingAlert.institutionalFlow,
          accumulation: matchingAlert.accumulation,
          volumeClimax: matchingAlert.volumeClimax,
          latency: matchingAlert.latency,
        });

        // Update position with alert data
        await db.update(positionHistory)
          .set({
            alertData,
            alertId: matchingAlert.id
          })
          .where(eq(positionHistory.id, position.id));

        matchedCount++;
        
        const timeDiff = Math.abs(new Date(position.openedAt).getTime() - matchingAlert.timestamp);
        matchDetails.push({
          positionId: position.id,
          symbol: position.symbol,
          side: position.side,
          openedAt: position.openedAt,
          alertId: matchingAlert.id,
          alertTimestamp: new Date(matchingAlert.timestamp).toISOString(),
          alertStatus: matchingAlert.executionStatus,
          timeDiffMs: timeDiff,
          matched: true
        });

        console.log(`[Match Alerts] ✅ Matched position #${position.id} (${position.symbol}) to alert #${matchingAlert.id} (time diff: ${timeDiff}ms, status: ${matchingAlert.executionStatus})`);
      } else {
        unmatchedCount++;
        matchDetails.push({
          positionId: position.id,
          symbol: position.symbol,
          side: position.side,
          openedAt: position.openedAt,
          matched: false,
          reason: 'No matching alert found within 10s window'
        });

        console.log(`[Match Alerts] ❌ No match for position #${position.id} (${position.symbol} @ ${position.openedAt})`);
      }
    }

    console.log(`[Match Alerts] Completed: ${matchedCount} matched, ${unmatchedCount} unmatched`);

    return NextResponse.json({
      success: true,
      message: `Dopasowano ${matchedCount} alertów do pozycji`,
      matched: matchedCount,
      unmatched: unmatchedCount,
      total: positionsWithoutAlerts.length,
      details: matchDetails
    });

  } catch (error) {
    console.error('[Match Alerts] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}