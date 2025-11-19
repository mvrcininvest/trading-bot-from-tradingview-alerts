import { NextResponse } from 'next/server';
import { db } from '@/db';
import { symbolLocks, diagnosticFailures, botDetailedLogs, botPositions } from '@/db/schema';
import { isNull, eq, and, inArray } from 'drizzle-orm';

// GET /api/bot/diagnostics/locks - Get all symbol locks
export async function GET() {
  try {
    const locks = await db.select()
      .from(symbolLocks)
      .orderBy(symbolLocks.lockedAt);

    return NextResponse.json({
      success: true,
      locks,
      activeCount: locks.filter(l => !l.unlockedAt).length,
      totalCount: locks.length
    });
  } catch (error: any) {
    console.error('Failed to fetch symbol locks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch locks' },
      { status: 500 }
    );
  }
}

// POST /api/bot/diagnostics/locks/unlock - Unlock a symbol and clean up related errors
export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    console.log(`🔓 Unlocking symbol ${symbol} and cleaning up errors...`);

    // 1. Find all positions for this symbol
    const positions = await db.select({ id: botPositions.id })
      .from(botPositions)
      .where(eq(botPositions.symbol, symbol));
    
    const positionIds = positions.map(p => p.id);
    console.log(`   Found ${positionIds.length} positions for ${symbol}`);

    let deletedFailures = 0;
    let deletedVerifications = 0;

    if (positionIds.length > 0) {
      // 2. Delete all diagnostic failures for these positions
      const failuresResult = await db.delete(diagnosticFailures)
        .where(inArray(diagnosticFailures.positionId, positionIds));
      deletedFailures = failuresResult.rowsAffected || 0;
      console.log(`   🗑️ Deleted ${deletedFailures} diagnostic failures`);

      // 3. Delete all failed verifications (hasDiscrepancy=true) for these positions
      const verificationsResult = await db.delete(botDetailedLogs)
        .where(and(
          inArray(botDetailedLogs.positionId, positionIds),
          eq(botDetailedLogs.hasDiscrepancy, true)
        ));
      deletedVerifications = verificationsResult.rowsAffected || 0;
      console.log(`   🗑️ Deleted ${deletedVerifications} failed verifications`);
    }

    // 4. Update lock to set unlockedAt
    await db.update(symbolLocks)
      .set({ 
        unlockedAt: new Date().toISOString() 
      })
      .where(eq(symbolLocks.symbol, symbol));

    console.log(`✅ Symbol ${symbol} unlocked and cleaned up!`);

    return NextResponse.json({
      success: true,
      message: `Symbol ${symbol} unlocked successfully`,
      cleaned: {
        diagnosticFailures: deletedFailures,
        failedVerifications: deletedVerifications,
        positionsChecked: positionIds.length
      }
    });
  } catch (error: any) {
    console.error('Failed to unlock symbol:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlock symbol' },
      { status: 500 }
    );
  }
}