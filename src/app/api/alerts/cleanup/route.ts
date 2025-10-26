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

    // Delete all alerts where createdAt < today's start
    const deletedRecords = await db.delete(alerts)
      .where(lt(alerts.createdAt, todayStart))
      .returning();

    const deletedCount = deletedRecords.length;

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: `Usunięto ${deletedCount} starych alertów`
    }, { status: 200 });

  } catch (error) {
    console.error('DELETE error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 });
  }
}