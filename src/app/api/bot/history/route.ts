import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { eq, like, desc, and, gte, lte, gt, lt, sql } from 'drizzle-orm';

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

    // Parse filter parameters
    const symbol = searchParams.get('symbol');
    const side = searchParams.get('side');
    const tier = searchParams.get('tier');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const minPnl = searchParams.get('minPnl');
    const maxPnl = searchParams.get('maxPnl');
    const profitOnly = searchParams.get('profitOnly') === 'true';
    const lossOnly = searchParams.get('lossOnly') === 'true';

    // Validate side parameter
    if (side && side !== 'Buy' && side !== 'Sell') {
      return NextResponse.json({ 
        error: 'Side must be either "Buy" or "Sell"',
        code: 'INVALID_SIDE' 
      }, { status: 400 });
    }

    // Validate PnL parameters
    let minPnlValue: number | null = null;
    let maxPnlValue: number | null = null;
    
    if (minPnl) {
      minPnlValue = parseFloat(minPnl);
      if (isNaN(minPnlValue)) {
        return NextResponse.json({ 
          error: 'minPnl must be a valid number',
          code: 'INVALID_MIN_PNL' 
        }, { status: 400 });
      }
    }

    if (maxPnl) {
      maxPnlValue = parseFloat(maxPnl);
      if (isNaN(maxPnlValue)) {
        return NextResponse.json({ 
          error: 'maxPnl must be a valid number',
          code: 'INVALID_MAX_PNL' 
        }, { status: 400 });
      }
    }

    // Build filter conditions
    const conditions = [];

    if (symbol) {
      conditions.push(like(positionHistory.symbol, `%${symbol}%`));
    }

    if (side) {
      conditions.push(eq(positionHistory.side, side));
    }

    if (tier) {
      conditions.push(eq(positionHistory.tier, tier));
    }

    if (startDate) {
      conditions.push(gte(positionHistory.closedAt, startDate));
    }

    if (endDate) {
      conditions.push(lte(positionHistory.closedAt, endDate));
    }

    if (minPnlValue !== null) {
      conditions.push(gte(positionHistory.pnl, minPnlValue));
    }

    if (maxPnlValue !== null) {
      conditions.push(lte(positionHistory.pnl, maxPnlValue));
    }

    if (profitOnly) {
      conditions.push(gt(positionHistory.pnl, 0));
    }

    if (lossOnly) {
      conditions.push(lt(positionHistory.pnl, 0));
    }

    // Build WHERE condition
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;

    // Get paginated results with conditional where clause
    const history = whereCondition
      ? await db.select()
          .from(positionHistory)
          .where(whereCondition)
          .orderBy(desc(positionHistory.closedAt))
          .limit(limit)
          .offset(offset)
      : await db.select()
          .from(positionHistory)
          .orderBy(desc(positionHistory.closedAt))
          .limit(limit)
          .offset(offset);

    // Get total count for filtered results
    const countResult = whereCondition
      ? await db.select({ count: sql<number>`count(*)` })
          .from(positionHistory)
          .where(whereCondition)
      : await db.select({ count: sql<number>`count(*)` })
          .from(positionHistory);

    const total = countResult[0]?.count || 0;

    // Calculate statistics for filtered results
    const statsResult = whereCondition
      ? await db.select({
          totalPnl: sql<number>`COALESCE(SUM(${positionHistory.pnl}), 0)`,
          avgPnl: sql<number>`COALESCE(AVG(${positionHistory.pnl}), 0)`,
          profitableCount: sql<number>`SUM(CASE WHEN ${positionHistory.pnl} > 0 THEN 1 ELSE 0 END)`,
          totalCount: sql<number>`COUNT(*)`
        })
        .from(positionHistory)
        .where(whereCondition)
      : await db.select({
          totalPnl: sql<number>`COALESCE(SUM(${positionHistory.pnl}), 0)`,
          avgPnl: sql<number>`COALESCE(AVG(${positionHistory.pnl}), 0)`,
          profitableCount: sql<number>`SUM(CASE WHEN ${positionHistory.pnl} > 0 THEN 1 ELSE 0 END)`,
          totalCount: sql<number>`COUNT(*)`
        })
        .from(positionHistory);

    const stats = statsResult[0];

    const winRate = stats.totalCount > 0 
      ? ((stats.profitableCount / stats.totalCount) * 100) 
      : 0;

    return NextResponse.json({
      success: true,
      history,
      total,
      limit,
      offset,
      stats: {
        totalPnl: Math.round(stats.totalPnl * 100) / 100,
        avgPnl: Math.round(stats.avgPnl * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        totalPositions: stats.totalCount
      }
    }, { status: 200 });

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}