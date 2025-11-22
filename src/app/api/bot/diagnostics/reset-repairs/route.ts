import { NextResponse } from 'next/server';
import { db } from '@/db';
import { tpslRetryAttempts } from '@/db/schema';
import { sql, eq } from 'drizzle-orm';

// POST /api/bot/diagnostics/reset-repairs - Reset all repair attempts
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const positionId = searchParams.get('positionId');

    if (positionId) {
      // Reset for specific position
      const result = await db.delete(tpslRetryAttempts)
        .where(eq(tpslRetryAttempts.positionId, parseInt(positionId)))
        .returning();
      
      return NextResponse.json({
        success: true,
        message: `Reset repair attempts for position ${positionId}`,
        deleted: result.length
      });
    } else {
      // Reset ALL repair attempts
      const result = await db.delete(tpslRetryAttempts)
        .returning();
      
      return NextResponse.json({
        success: true,
        message: 'Reset ALL repair attempts',
        deleted: result.length
      });
    }
  } catch (error: any) {
    console.error('Failed to reset repair attempts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset repair attempts' },
      { status: 500 }
    );
  }
}