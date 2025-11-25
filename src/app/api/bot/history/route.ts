import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { desc } from 'drizzle-orm';

// ============================================
// 🔥 ENHANCED CLOSE REASON CLASSIFIER
// ============================================

function classifyCloseReason(position: any): string {
  const pnl = typeof position.pnl === 'number' ? position.pnl : parseFloat(position.pnl || "0");
  
  // Check which TP was hit based on flags
  if (pnl > 0) {
    if (position.tp3Hit) return 'tp3_hit';
    if (position.tp2Hit) return 'tp2_hit';
    if (position.tp1Hit) return 'tp1_hit';
    return 'tp_main_hit';
  }

  if (pnl < 0) {
    return 'sl_hit';
  }

  return 'closed_on_exchange';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse and validate pagination parameters
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    
    let limit = 50;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        return NextResponse.json({ 
          error: 'Limit must be a positive integer',
          code: 'INVALID_LIMIT' 
        }, { status: 400 });
      }
      limit = Math.min(parsedLimit, 200);
    }

    let offset = 0;
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return NextResponse.json({ 
          error: 'Offset must be a non-negative integer',
          code: 'INVALID_OFFSET' 
        }, { status: 400 });
      }
      offset = parsedOffset;
    }

    // ✅ FIXED: Fetch history from local database
    console.log("[History API] Fetching closed positions from local database...");
    
    const historyRecords = await db
      .select()
      .from(positionHistory)
      .orderBy(desc(positionHistory.closedAt))
      .limit(limit)
      .offset(offset);

    console.log(`[History API] ✅ Fetched ${historyRecords.length} positions from database`);

    // Transform database records to API format
    const formattedHistory = historyRecords.map((record) => ({
      id: record.id,
      positionId: record.positionId,
      alertId: record.alertId,
      symbol: record.symbol,
      side: record.side,
      tier: record.tier,
      entryPrice: record.entryPrice,
      closePrice: record.closePrice,
      quantity: record.quantity,
      leverage: record.leverage,
      pnl: record.pnl,
      pnlPercent: record.pnlPercent,
      closeReason: record.closeReason,
      tp1Hit: record.tp1Hit,
      tp2Hit: record.tp2Hit,
      tp3Hit: record.tp3Hit,
      confirmationCount: record.confirmationCount,
      openedAt: record.openedAt,
      closedAt: record.closedAt,
      durationMinutes: record.durationMinutes,
      source: "database" as const,
    }));

    // Get total count for pagination
    const totalRecords = await db
      .select()
      .from(positionHistory);

    // Calculate statistics
    const totalPnl = formattedHistory.reduce((sum, p) => sum + p.pnl, 0);
    const avgPnl = formattedHistory.length > 0 ? totalPnl / formattedHistory.length : 0;
    const profitableCount = formattedHistory.filter(p => p.pnl > 0).length;
    const totalCount = formattedHistory.length;
    const winRate = totalCount > 0 ? (profitableCount / totalCount) * 100 : 0;

    return NextResponse.json({
      success: true,
      history: formattedHistory,
      total: totalRecords.length,
      limit,
      offset,
      stats: {
        totalPnl: Math.round(totalPnl * 100) / 100,
        avgPnl: Math.round(avgPnl * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        totalPositions: totalCount
      }
    }, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}