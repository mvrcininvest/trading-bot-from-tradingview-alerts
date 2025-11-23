import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { and, gte, lte, desc, eq, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const format = searchParams.get('format') || 'json'; // json or csv
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const daysParam = searchParams.get('days');
    const allParam = searchParams.get('all');
    
    // ✅ NEW: Advanced Filters
    const tierParam = searchParams.get('tier'); // e.g., "Platinum" or "Platinum,Premium"
    const symbolParam = searchParams.get('symbol'); // e.g., "BTCUSDT" or "BTCUSDT,ETHUSDT"
    const sideParam = searchParams.get('side'); // "Buy" or "Sell"
    
    // Build filter conditions
    let filters: any[] = [];
    
    // Date filter
    if (allParam === 'true') {
      console.log('[Export] Exporting ALL positions');
    } else if (daysParam) {
      const days = parseInt(daysParam);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      filters.push(gte(positionHistory.closedAt, fromDate.toISOString()));
      console.log(`[Export] Exporting last ${days} days`);
    } else if (fromParam && toParam) {
      filters.push(gte(positionHistory.closedAt, fromParam));
      filters.push(lte(positionHistory.closedAt, toParam));
      console.log(`[Export] Exporting range: ${fromParam} to ${toParam}`);
    } else if (fromParam) {
      filters.push(gte(positionHistory.closedAt, fromParam));
      console.log(`[Export] Exporting from: ${fromParam}`);
    } else if (toParam) {
      filters.push(lte(positionHistory.closedAt, toParam));
      console.log(`[Export] Exporting to: ${toParam}`);
    } else {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      filters.push(gte(positionHistory.closedAt, fromDate.toISOString()));
      console.log('[Export] Exporting last 30 days (default)');
    }
    
    // ✅ Advanced Filters: Tier
    if (tierParam) {
      const tiers = tierParam.split(',').map(t => t.trim());
      if (tiers.length === 1) {
        filters.push(eq(positionHistory.tier, tiers[0]));
        console.log(`[Export] Filtering by tier: ${tiers[0]}`);
      } else {
        filters.push(inArray(positionHistory.tier, tiers));
        console.log(`[Export] Filtering by tiers: ${tiers.join(', ')}`);
      }
    }
    
    // ✅ Advanced Filters: Symbol
    if (symbolParam) {
      const symbols = symbolParam.split(',').map(s => s.trim());
      if (symbols.length === 1) {
        filters.push(eq(positionHistory.symbol, symbols[0]));
        console.log(`[Export] Filtering by symbol: ${symbols[0]}`);
      } else {
        filters.push(inArray(positionHistory.symbol, symbols));
        console.log(`[Export] Filtering by symbols: ${symbols.join(', ')}`);
      }
    }
    
    // ✅ Advanced Filters: Side
    if (sideParam && (sideParam === 'Buy' || sideParam === 'Sell')) {
      filters.push(eq(positionHistory.side, sideParam));
      console.log(`[Export] Filtering by side: ${sideParam}`);
    }
    
    // Fetch positions
    const positions = await db
      .select()
      .from(positionHistory)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(positionHistory.closedAt));
    
    console.log(`[Export] Found ${positions.length} positions to export`);
    
    if (positions.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No positions found for the selected filters',
        count: 0
      });
    }
    
    // Parse alertData and enrich positions
    const enrichedPositions = positions.map(pos => {
      let alertDataParsed: any = null;
      
      if (pos.alertData) {
        try {
          alertDataParsed = JSON.parse(pos.alertData);
        } catch (e) {
          console.error(`Failed to parse alertData for position ${pos.id}:`, e);
        }
      }
      
      return {
        // Position data
        positionId: pos.id,
        symbol: pos.symbol,
        side: pos.side,
        tier: pos.tier,
        entryPrice: pos.entryPrice,
        closePrice: pos.closePrice,
        quantity: pos.quantity,
        leverage: pos.leverage,
        pnl: pos.pnl,
        pnlPercent: pos.pnlPercent,
        closeReason: pos.closeReason,
        tp1Hit: pos.tp1Hit,
        tp2Hit: pos.tp2Hit,
        tp3Hit: pos.tp3Hit,
        confirmationCount: pos.confirmationCount,
        openedAt: pos.openedAt,
        closedAt: pos.closedAt,
        durationMinutes: pos.durationMinutes,
        
        // Alert data (if available)
        alert: alertDataParsed ? {
          strength: alertDataParsed.strength || null,
          tierNumeric: alertDataParsed.tierNumeric || null,
          mode: alertDataParsed.mode || null,
          atr: alertDataParsed.atr || null,
          volumeRatio: alertDataParsed.volumeRatio || null,
          session: alertDataParsed.timing?.session || alertDataParsed.session || null,
          regime: alertDataParsed.smcContext?.regime || alertDataParsed.regime || null,
          regimeConfidence: alertDataParsed.smcContext?.regimeConfidence || alertDataParsed.regimeConfidence || null,
          mtfAgreement: alertDataParsed.technical?.mtfAgreement || alertDataParsed.mtfAgreement || null,
          adx: alertDataParsed.technical?.adx || null,
          mfi: alertDataParsed.technical?.mfi || null,
          emaAlignment: alertDataParsed.technical?.emaAlignment || null,
          vwapPosition: alertDataParsed.technical?.vwapPosition || null,
          institutionalFlow: alertDataParsed.institutionalFlow || null,
          accumulation: alertDataParsed.accumulation || null,
          volumeClimax: alertDataParsed.volumeClimax || null,
          inOb: alertDataParsed.inOb || null,
          inFvg: alertDataParsed.inFvg || null,
          obScore: alertDataParsed.obScore || null,
          fvgScore: alertDataParsed.fvgScore || null,
          liquiditySweep: alertDataParsed.smcContext?.liquiditySweep || null,
          cvdDivergence: alertDataParsed.smcContext?.cvdDivergence || null,
          btcCorrelation: alertDataParsed.smcContext?.btcCorrelation || null,
          marketCondition: alertDataParsed.filters?.marketCondition || null,
          fakeBreakoutPenalty: alertDataParsed.filters?.fakeBreakoutPenalty || null,
          waveMultiplier: alertDataParsed.filters?.waveMultiplier || null,
          volumeMultiplier: alertDataParsed.filters?.volumeMultiplier || null,
          regimeMultiplier: alertDataParsed.filters?.regimeMultiplier || null,
          tvTs: alertDataParsed.tvTs || null,
        } : null
      };
    });
    
    // Return based on format
    if (format === 'csv') {
      // Generate CSV
      const csvRows: string[] = [];
      
      // CSV Header
      csvRows.push([
        'Position ID',
        'Symbol',
        'Side',
        'Tier',
        'Entry Price',
        'Close Price',
        'Quantity',
        'Leverage',
        'PnL (USDT)',
        'PnL (%)',
        'Close Reason',
        'TP1 Hit',
        'TP2 Hit',
        'TP3 Hit',
        'Confirmation Count',
        'Opened At',
        'Closed At',
        'Duration (min)',
        // Alert fields
        'Alert Strength',
        'Alert Tier Numeric',
        'Alert Mode',
        'ATR',
        'Volume Ratio',
        'Session',
        'Regime',
        'Regime Confidence',
        'MTF Agreement',
        'ADX',
        'MFI',
        'EMA Alignment',
        'VWAP Position',
        'Institutional Flow',
        'Accumulation',
        'Volume Climax',
        'In OB',
        'In FVG',
        'OB Score',
        'FVG Score',
        'Liquidity Sweep',
        'CVD Divergence',
        'BTC Correlation',
        'Market Condition',
        'Fake Breakout Penalty',
        'Wave Multiplier',
        'Volume Multiplier',
        'Regime Multiplier',
        'TradingView Timestamp'
      ].join(','));
      
      // CSV Data
      enrichedPositions.forEach(pos => {
        const row = [
          pos.positionId,
          pos.symbol,
          pos.side,
          pos.tier,
          pos.entryPrice,
          pos.closePrice,
          pos.quantity,
          pos.leverage,
          pos.pnl,
          pos.pnlPercent,
          pos.closeReason,
          pos.tp1Hit ? 'true' : 'false',
          pos.tp2Hit ? 'true' : 'false',
          pos.tp3Hit ? 'true' : 'false',
          pos.confirmationCount,
          pos.openedAt,
          pos.closedAt,
          pos.durationMinutes || '',
          // Alert fields
          pos.alert?.strength ?? '',
          pos.alert?.tierNumeric ?? '',
          pos.alert?.mode ?? '',
          pos.alert?.atr ?? '',
          pos.alert?.volumeRatio ?? '',
          pos.alert?.session ?? '',
          pos.alert?.regime ?? '',
          pos.alert?.regimeConfidence ?? '',
          pos.alert?.mtfAgreement ?? '',
          pos.alert?.adx ?? '',
          pos.alert?.mfi ?? '',
          pos.alert?.emaAlignment ?? '',
          pos.alert?.vwapPosition ?? '',
          pos.alert?.institutionalFlow ?? '',
          pos.alert?.accumulation ?? '',
          pos.alert?.volumeClimax ?? '',
          pos.alert?.inOb ?? '',
          pos.alert?.inFvg ?? '',
          pos.alert?.obScore ?? '',
          pos.alert?.fvgScore ?? '',
          pos.alert?.liquiditySweep ?? '',
          pos.alert?.cvdDivergence ?? '',
          pos.alert?.btcCorrelation ?? '',
          pos.alert?.marketCondition ?? '',
          pos.alert?.fakeBreakoutPenalty ?? '',
          pos.alert?.waveMultiplier ?? '',
          pos.alert?.volumeMultiplier ?? '',
          pos.alert?.regimeMultiplier ?? '',
          pos.alert?.tvTs ?? ''
        ];
        
        csvRows.push(row.join(','));
      });
      
      const csvContent = csvRows.join('\n');
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="positions_export_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
      
    } else {
      // Return JSON
      return NextResponse.json({
        success: true,
        count: enrichedPositions.length,
        exported_at: new Date().toISOString(),
        filters: {
          format,
          from: fromParam,
          to: toParam,
          days: daysParam,
          all: allParam === 'true',
          tier: tierParam,
          symbol: symbolParam,
          side: sideParam
        },
        positions: enrichedPositions
      });
    }
    
  } catch (error) {
    console.error('[Export] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}