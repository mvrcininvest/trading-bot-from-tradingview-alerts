import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { capitulationCounter } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    // Get existing counter
    const existing = await db.select()
      .from(capitulationCounter)
      .limit(1);

    const now = new Date().toISOString();

    if (existing.length === 0) {
      // Create new counter if doesn't exist
      await db.insert(capitulationCounter).values({
        closureCount: 0,
        lastResetAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Reset existing counter
      await db.update(capitulationCounter)
        .set({
          closureCount: 0,
          lastResetAt: now,
          updatedAt: now,
        });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Licznik kapitulacji został zresetowany',
      resetAt: now
    }, { status: 200 });
  } catch (error) {
    console.error('Capitulation reset error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}
