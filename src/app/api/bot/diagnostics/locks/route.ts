import { NextResponse } from 'next/server';
import { db } from '@/db';
import { symbolLocks } from '@/db/schema';
import { isNull, eq } from 'drizzle-orm';

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

// POST /api/bot/diagnostics/locks/unlock - Unlock a symbol
export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    // Update lock to set unlockedAt
    await db.update(symbolLocks)
      .set({ 
        unlockedAt: new Date().toISOString() 
      })
      .where(eq(symbolLocks.symbol, symbol));

    console.log(`✅ Symbol ${symbol} unlocked`);

    return NextResponse.json({
      success: true,
      message: `Symbol ${symbol} unlocked successfully`
    });
  } catch (error: any) {
    console.error('Failed to unlock symbol:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to unlock symbol' },
      { status: 500 }
    );
  }
}
