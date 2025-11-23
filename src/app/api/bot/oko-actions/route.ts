import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionGuardActions, botPositions } from '@/db/schema';
import { desc, eq, and, gte } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const actionType = searchParams.get('actionType') || 'all';
    const hours = parseInt(searchParams.get('hours') || '24');

    // Calculate time threshold
    const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Build query
    let query = db.select({
      action: positionGuardActions,
      position: botPositions,
    })
      .from(positionGuardActions)
      .leftJoin(botPositions, eq(positionGuardActions.positionId, botPositions.id))
      .where(gte(positionGuardActions.createdAt, timeThreshold))
      .orderBy(desc(positionGuardActions.createdAt))
      .limit(limit);

    const results = await query;

    // Filter by action type if specified
    let filteredResults = results;
    if (actionType !== 'all') {
      filteredResults = results.filter(r => r.action.actionType === actionType);
    }

    // Calculate position stats (winning/losing/stale)
    const positionsWithStats = filteredResults
      .filter(r => r.position !== null)
      .map(r => r.position!);
    
    const winning = positionsWithStats.filter(p => p.unrealisedPnl > 0).length;
    const losing = positionsWithStats.filter(p => p.unrealisedPnl < 0).length;
    const stale = positionsWithStats.filter(p => p.unrealisedPnl === 0).length;

    // Calculate statistics
    const stats = {
      total: filteredResults.length,
      winning,
      losing,
      stale,
      closures: filteredResults.filter(r => 
        r.action.actionType.includes('emergency') || 
        r.action.actionType.includes('sl_breach') ||
        r.action.actionType.includes('pnl_emergency') ||
        r.action.actionType.includes('multi_position_correlation') ||
        r.action.actionType.includes('time_based_exit') ||
        r.action.actionType.includes('account_drawdown')
      ).length,
      repairs: filteredResults.filter(r => 
        r.action.actionType.includes('missing_sl_tp') ||
        r.action.actionType.includes('tp1_quantity_fix') ||
        r.action.actionType.includes('ghost_position_cleanup')
      ).length,
      byType: {} as Record<string, number>,
    };

    // Count by action type
    filteredResults.forEach(r => {
      const type = r.action.actionType;
      stats.byType[type] = (stats.byType[type] || 0) + 1;
    });

    // Format results
    const actions = filteredResults.map(r => ({
      id: r.action.id,
      positionId: r.action.positionId,
      actionType: r.action.actionType,
      reason: r.action.reason,
      checkCount: r.action.checkCount,
      createdAt: r.action.createdAt,
      metadata: r.action.metadata ? JSON.parse(r.action.metadata) : null,
      position: r.position ? {
        symbol: r.position.symbol,
        side: r.position.side,
        tier: r.position.tier,
        entryPrice: r.position.entryPrice,
        unrealisedPnl: r.position.unrealisedPnl,
      } : null,
    }));

    return NextResponse.json({
      success: true,
      actions,
      stats,
      timeRange: {
        from: timeThreshold,
        to: new Date().toISOString(),
        hours,
      },
    });
  } catch (error: any) {
    console.error('Failed to get Oko actions:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}