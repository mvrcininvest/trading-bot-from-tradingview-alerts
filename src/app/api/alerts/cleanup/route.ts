import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';
import { lt, sql } from 'drizzle-orm';

export async function DELETE(request: NextRequest) {
  try {
    // Calculate today's start timestamp (00:00:00 of current day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    console.log(`[Cleanup] Deleting alerts older than ${todayStart}`);

    // ✅ FIX: Use execute() instead of returning() for better compatibility
    const result = await db.delete(alerts)
      .where(lt(alerts.createdAt, todayStart));

    // Get count using separate query
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(alerts);

    const totalRemaining = countResult[0]?.count || 0;

    console.log(`[Cleanup] Successfully deleted old alerts. Remaining: ${totalRemaining}`);

    return NextResponse.json({
      success: true,
      message: `Wyczyszczono stare alerty (pozostało: ${totalRemaining})`,
      remainingCount: totalRemaining
    }, { status: 200 });

  } catch (error) {
    console.error('[Cleanup] DELETE error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error('[Cleanup] Error details:', {
      message: errorMessage,
      stack: errorStack
    });
    
    return NextResponse.json({
      success: false,
      error: 'Błąd czyszczenia bazy danych',
      message: errorMessage
    }, { status: 500 });
  }
}