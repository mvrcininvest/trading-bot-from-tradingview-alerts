import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';
import { getBybitPositionsHistory, convertSymbolFromBybit } from '@/lib/bybit-helpers';

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

    // ✅ NOWE: Pobierz credentials z bazy
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json({ 
        error: 'No Bybit API credentials configured',
        code: 'NO_CREDENTIALS' 
      }, { status: 400 });
    }

    const { apiKey, apiSecret } = settings[0];

    // ✅ NOWE: Pobierz historię TYLKO z Bybit API
    console.log("[History API] Fetching closed positions from Bybit API...");
    
    try {
      const bybitData = await getBybitPositionsHistory(apiKey!, apiSecret!, 100);
      
      // Transform Bybit data to match our format
      const bybitHistory = bybitData.map((p: any) => {
        const symbol = convertSymbolFromBybit(p.symbol);
        const side = p.side;
        const pnl = parseFloat(p.closedPnl || "0");
        const closedAt = new Date(parseInt(p.updatedTime)).toISOString();
        const leverage = parseFloat(p.leverage || "1");
        const avgEntryPrice = parseFloat(p.avgEntryPrice || "0");
        const avgExitPrice = parseFloat(p.avgExitPrice || avgEntryPrice);
        const quantity = Math.abs(parseFloat(p.qty || "0"));
        
        const positionValue = quantity * avgEntryPrice;
        const initialMargin = positionValue / leverage;
        const pnlPercent = initialMargin > 0 ? (pnl / initialMargin) * 100 : 0;
        
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
          tier: "Bybit API",
          entryPrice: avgEntryPrice,
          closePrice: avgExitPrice,
          quantity,
          leverage,
          pnl,
          pnlPercent,
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
      
      console.log(`[History API] ✅ Fetched ${bybitHistory.length} positions from Bybit API`);

      // Sort by closed date (newest first)
      const sortedHistory = bybitHistory.sort((a, b) => 
        new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
      );

      // Calculate statistics
      const totalPnl = sortedHistory.reduce((sum, p) => sum + p.pnl, 0);
      const avgPnl = sortedHistory.length > 0 ? totalPnl / sortedHistory.length : 0;
      const profitableCount = sortedHistory.filter(p => p.pnl > 0).length;
      const totalCount = sortedHistory.length;
      const winRate = totalCount > 0 ? (profitableCount / totalCount) * 100 : 0;

      return NextResponse.json({
        success: true,
        history: sortedHistory.slice(offset, offset + limit),
        total: sortedHistory.length,
        limit,
        offset,
        bybitHistoryEnabled: true,
        bybitHistoryCount: sortedHistory.length,
        stats: {
          totalPnl: Math.round(totalPnl * 100) / 100,
          avgPnl: Math.round(avgPnl * 100) / 100,
          winRate: Math.round(winRate * 100) / 100,
          totalPositions: totalCount
        }
      }, { status: 200 });

    } catch (bybitError) {
      console.error('[History API] Failed to fetch from Bybit:', bybitError);
      return NextResponse.json({ 
        error: 'Failed to fetch history from Bybit API',
        message: bybitError instanceof Error ? bybitError.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}