import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botActions } from '@/db/schema';
import { eq, and, gte, desc, like } from 'drizzle-orm';

/**
 * GET /api/bot/diagnostics/oko-actions
 * 
 * Pobiera wszystkie akcje wykonane przez Oko Saurona
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    
    // Pobierz akcje Oka Saurona (wszystkie które zawierają "oko" w action_type)
    const okoActions = await db.select()
      .from(botActions)
      .where(
        like(botActions.actionType, '%oko%')
      )
      .orderBy(desc(botActions.timestamp))
      .limit(limit);

    console.log(`[Oko Actions API] Found ${okoActions.length} Oko Saurona actions`);

    // Grupuj akcje po typie
    const actionCounts: Record<string, number> = {};
    okoActions.forEach(action => {
      const type = action.actionType;
      actionCounts[type] = (actionCounts[type] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      actions: okoActions,
      count: okoActions.length,
      actionCounts,
    });
  } catch (error) {
    console.error('[Oko Actions API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch Oko Saurona actions',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
