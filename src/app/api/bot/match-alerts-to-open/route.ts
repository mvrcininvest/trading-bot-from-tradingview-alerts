import { NextResponse } from 'next/server';
import { db } from '@/db';
import { botPositions, alerts } from '@/db/schema';
import { isNull, eq, and, or } from 'drizzle-orm';

/**
 * 🔗 AUTO-MATCH ALERTS TO OPEN POSITIONS
 * 
 * Automatically matches alerts to currently open positions based on:
 * 1. Symbol (must match exactly)
 * 2. Timestamp (openedAt vs alert timestamp - max 30s difference)
 * 3. Side (must match if both available)
 */

export async function POST() {
  try {
    console.log('[Match Alerts Open] Starting auto-match for OPEN positions...');

    // Step 1: Get all OPEN positions without alert data
    const positionsWithoutAlerts = await db.select()
      .from(botPositions)
      .where(
        and(
          or(
            eq(botPositions.status, 'open'),
            eq(botPositions.status, 'partial_close')
          ),
          or(
            isNull(botPositions.alertData),
            eq(botPositions.alertData, ''),
            isNull(botPositions.alertId)
          )
        )
      );

    console.log(`[Match Alerts Open] Found ${positionsWithoutAlerts.length} open positions without alert data`);

    if (positionsWithoutAlerts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Wszystkie otwarte pozycje mają już przypisane alerty',
        matched: 0,
        unmatched: 0,
        total: 0
      });
    }

    // Step 2: Get ALL alerts
    const allAlerts = await db.select()
      .from(alerts);

    console.log(`[Match Alerts Open] Found ${allAlerts.length} total alerts in database`);

    // Step 3: Match positions to alerts
    let matchedCount = 0;
    let unmatchedCount = 0;
    const matchDetails: any[] = [];

    for (const position of positionsWithoutAlerts) {
      const positionOpenTime = new Date(position.openedAt).getTime();
      
      // Find matching alert:
      // 1. Same symbol
      // 2. Timestamp within ±30 seconds of position open time
      // 3. Side matches (case-insensitive comparison)
      const matchingAlert = allAlerts.find(alert => {
        // ✅ FIX: Convert alert timestamp from SECONDS to MILLISECONDS
        const alertTime = alert.timestamp * 1000;
        const timeDiff = Math.abs(positionOpenTime - alertTime);
        
        // Debug log for first alert check
        if (alert.symbol === position.symbol) {
          console.log(`[Match Check] Alert #${alert.id}: ${alert.symbol} ${alert.side} @ ${new Date(alertTime).toISOString()}`);
          console.log(`              Position: ${position.symbol} ${position.side} @ ${position.openedAt}`);
          console.log(`              Time diff: ${timeDiff}ms (threshold: 30000ms)`);
        }
        
        // Symbol must match
        if (alert.symbol !== position.symbol) return false;
        
        // Time difference must be ≤30 seconds (30000ms)
        if (timeDiff > 30000) {
          if (alert.symbol === position.symbol) {
            console.log(`              ❌ Time diff too large: ${timeDiff}ms > 30000ms`);
          }
          return false;
        }
        
        // Side should match (case-insensitive if both are available)
        if (alert.side && position.side) {
          if (alert.side.toUpperCase() !== position.side.toUpperCase()) {
            console.log(`              ❌ Side mismatch: ${alert.side} !== ${position.side}`);
            return false;
          }
        }
        
        console.log(`              ✅ MATCH FOUND!`);
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

        // Update OPEN position with alert data
        await db.update(botPositions)
          .set({
            alertData,
            alertId: matchingAlert.id
          })
          .where(eq(botPositions.id, position.id));

        matchedCount++;
        
        const timeDiff = Math.abs(new Date(position.openedAt).getTime() - (matchingAlert.timestamp * 1000));
        matchDetails.push({
          positionId: position.id,
          symbol: position.symbol,
          side: position.side,
          openedAt: position.openedAt,
          alertId: matchingAlert.id,
          alertTimestamp: new Date(matchingAlert.timestamp * 1000).toISOString(),
          alertStatus: matchingAlert.executionStatus,
          timeDiffMs: timeDiff,
          matched: true
        });

        console.log(`[Match Alerts Open] ✅ Matched position #${position.id} (${position.symbol}) to alert #${matchingAlert.id} (time diff: ${timeDiff}ms, status: ${matchingAlert.executionStatus})`);
      } else {
        unmatchedCount++;
        matchDetails.push({
          positionId: position.id,
          symbol: position.symbol,
          side: position.side,
          openedAt: position.openedAt,
          matched: false,
          reason: 'No matching alert found within 30s window'
        });

        console.log(`[Match Alerts Open] ❌ No match for position #${position.id} (${position.symbol} @ ${position.openedAt})`);
      }
    }

    console.log(`[Match Alerts Open] Completed: ${matchedCount} matched, ${unmatchedCount} unmatched`);

    return NextResponse.json({
      success: true,
      message: `Dopasowano ${matchedCount} alertów do otwartych pozycji`,
      matched: matchedCount,
      unmatched: unmatchedCount,
      total: positionsWithoutAlerts.length,
      details: matchDetails
    });

  } catch (error) {
    console.error('[Match Alerts Open] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}