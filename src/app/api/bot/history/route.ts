import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory, botSettings } from '@/db/schema';
import { eq, like, desc, and, gte, lte, gt, lt, sql } from 'drizzle-orm';
import { getBybitPositionsHistory, convertSymbolFromBybit } from '@/lib/bybit-helpers';

// ============================================
// 🔥 SMART CLOSE REASON CLASSIFIER
// ============================================

function classifyCloseReason(position: any): string {
  const closeReason = position.closeReason;
  
  // ✅ Only keep these specific close reasons (they are already correct)
  const keepAsIs = [
    'sl_hit', 'tp_main_hit', 'tp1_hit', 'tp2_hit', 'tp3_hit',
    'manual_close', 'emergency_override', 'opposite_direction',
    'oko_emergency', 'oko_sl_breach', 'ghost_position_cleanup'
  ];
  
  if (closeReason && keepAsIs.includes(closeReason)) {
    return closeReason;
  }

  // 🔥 For "closed_on_exchange", "auto_sync", "unknown", or null → classify by PnL
  const pnl = typeof position.pnl === 'number' ? position.pnl : parseFloat(position.pnl || "0");

  // If PnL is positive → must be TP hit
  if (pnl > 0) {
    if (position.tp3Hit) return 'tp3_hit';
    if (position.tp2Hit) return 'tp2_hit';
    if (position.tp1Hit) return 'tp1_hit';
    return 'tp_main_hit';
  }

  // If PnL is negative → must be SL hit
  if (pnl < 0) {
    return 'sl_hit';
  }

  // If PnL is exactly 0 → probably manual close
  return 'manual_close';
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
    const includeBybitHistory = searchParams.get('includeBybitHistory') === 'true';

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

    // ============================================
    // 🔥 CLASSIFY DATABASE POSITIONS
    // ============================================
    const classifiedHistory = history.map(position => ({
      ...position,
      closeReason: classifyCloseReason(position),
      source: "database" as const
    }));

    // ============================================
    // 🔥 FETCH CLOSED POSITIONS FROM BYBIT
    // ============================================
    
    let bybitHistory: any[] = [];
    let bybitHistoryEnabled = false;
    
    if (includeBybitHistory) {
      const settings = await db.select().from(botSettings).limit(1);
      
      if (settings.length > 0) {
        const botConfig = settings[0];
        const { apiKey, apiSecret } = botConfig;
        
        if (apiKey && apiSecret) {
          try {
            console.log("[History] Fetching closed positions from Bybit...");
            const bybitData = await getBybitPositionsHistory(apiKey, apiSecret, 100);
            
            // Transform Bybit data to match our format
            bybitHistory = bybitData.map((p: any) => {
              const symbol = convertSymbolFromBybit(p.symbol);
              const side = p.side;
              const pnl = parseFloat(p.closedPnl || "0");
              const closedAt = new Date(parseInt(p.updatedTime)).toISOString();
              const leverage = parseFloat(p.leverage || "1");
              const avgEntryPrice = parseFloat(p.avgEntryPrice || "0");
              const avgExitPrice = parseFloat(p.avgExitPrice || avgEntryPrice);
              const quantity = Math.abs(parseFloat(p.qty || "0"));
              
              const tempPosition = {
                pnl,
                tp1Hit: false,
                tp2Hit: false,
                tp3Hit: false,
                closeReason: 'bybit_history'
              };
              
              return {
                id: `bybit_${p.orderId}`,
                positionId: null,
                symbol,
                side,
                tier: "Bybit Historie",
                entryPrice: avgEntryPrice,
                closePrice: avgExitPrice,
                quantity,
                leverage,
                pnl,
                pnlPercent: avgEntryPrice > 0 ? ((avgExitPrice - avgEntryPrice) / avgEntryPrice * 100 * (side === "Buy" ? 1 : -1)) : 0,
                closeReason: classifyCloseReason(tempPosition),
                tp1Hit: false,
                tp2Hit: false,
                tp3Hit: false,
                confirmationCount: 0,
                openedAt: new Date(parseInt(p.createdTime)).toISOString(),
                closedAt,
                durationMinutes: Math.floor((parseInt(p.updatedTime) - parseInt(p.createdTime)) / 1000 / 60),
                source: "bybit" as const,
              };
            });
            
            bybitHistoryEnabled = true;
            console.log(`[History] Fetched ${bybitHistory.length} positions from Bybit`);
          } catch (error) {
            console.error("[History] Failed to fetch Bybit history:", error);
          }
        }
      }
    }

    // Combine DB history and Bybit history
    const combinedHistory = [
      ...classifiedHistory,
      ...bybitHistory
    ].sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());

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
      history: includeBybitHistory ? combinedHistory : classifiedHistory,
      total: includeBybitHistory ? combinedHistory.length : total,
      limit,
      offset,
      bybitHistoryEnabled,
      bybitHistoryCount: bybitHistory.length,
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