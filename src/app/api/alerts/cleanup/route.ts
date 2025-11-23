import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';
import { lt } from 'drizzle-orm';

export async function DELETE(request: NextRequest) {
  try {
    // Calculate today's start timestamp (00:00:00 of current day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    console.log(`[Cleanup] Deleting alerts older than ${todayStart}`);

    // Delete all alerts where createdAt < today's start
    const deletedRecords = await db.delete(alerts)
      .where(lt(alerts.createdAt, todayStart))
      .returning();

    const deletedCount = deletedRecords.length;

    console.log(`[Cleanup] Successfully deleted ${deletedCount} old alerts`);

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: `Usunięto ${deletedCount} starych alertów (sprzed dzisiaj)`
    }, { status: 200 });

  } catch (error) {
    console.error('[Cleanup] DELETE error:', error);
    
    // ✅ POPRAWKA: Bezpieczne wydobycie szczegółów błędu
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