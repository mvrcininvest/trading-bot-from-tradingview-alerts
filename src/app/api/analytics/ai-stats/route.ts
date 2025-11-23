import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { desc, and, gte } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    
    // Default to all-time if no days parameter
    let dateFilter: any[] = [];
    if (daysParam) {
      const days = parseInt(daysParam);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      dateFilter.push(gte(positionHistory.closedAt, fromDate.toISOString()));
      console.log(`[AI Stats] Analyzing last ${days} days`);
    } else {
      console.log('[AI Stats] Analyzing all-time data');
    }
    
    // Fetch all positions
    const positions = await db
      .select()
      .from(positionHistory)
      .where(dateFilter.length > 0 ? and(...dateFilter) : undefined)
      .orderBy(desc(positionHistory.closedAt));
    
    console.log(`[AI Stats] Analyzing ${positions.length} positions`);
    
    if (positions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No positions found for analysis',
        stats: null
      });
    }
    
    // Parse alert data for each position
    const enrichedPositions = positions.map(pos => {
      let alertData: any = null;
      if (pos.alertData) {
        try {
          alertData = JSON.parse(pos.alertData);
        } catch (e) {
          console.error(`Failed to parse alertData for position ${pos.id}`);
        }
      }
      return { ...pos, alertParsed: alertData };
    });
    
    // ====================================
    // WIN RATE BY TIER
    // ====================================
    const tierMap = new Map<string, { total: number; wins: number; pnl: number }>();
    
    enrichedPositions.forEach(pos => {
      const tier = pos.tier || 'Unknown';
      if (!tierMap.has(tier)) {
        tierMap.set(tier, { total: 0, wins: 0, pnl: 0 });
      }
      const tierData = tierMap.get(tier)!;
      tierData.total++;
      if (pos.pnl > 0) tierData.wins++;
      tierData.pnl += pos.pnl;
    });
    
    const winRateByTier = Array.from(tierMap.entries()).map(([tier, data]) => ({
      tier,
      totalTrades: data.total,
      winningTrades: data.wins,
      losingTrades: data.total - data.wins,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL);
    
    // ====================================
    // WIN RATE BY CONFIRMATION COUNT
    // ====================================
    const confirmationMap = new Map<number, { total: number; wins: number; pnl: number }>();
    
    enrichedPositions.forEach(pos => {
      const count = pos.confirmationCount || 1;
      if (!confirmationMap.has(count)) {
        confirmationMap.set(count, { total: 0, wins: 0, pnl: 0 });
      }
      const confirmData = confirmationMap.get(count)!;
      confirmData.total++;
      if (pos.pnl > 0) confirmData.wins++;
      confirmData.pnl += pos.pnl;
    });
    
    const winRateByConfirmation = Array.from(confirmationMap.entries()).map(([count, data]) => ({
      confirmationCount: count,
      totalTrades: data.total,
      winningTrades: data.wins,
      losingTrades: data.total - data.wins,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => a.confirmationCount - b.confirmationCount);
    
    // ====================================
    // LATENCY ANALYSIS (receivedAt from botPositions needed)
    // ====================================
    // Note: We don't have receivedAt in positionHistory, so we'll skip this for now
    // or note that it requires joining with botPositions table
    
    const latencyStats = {
      note: 'Latency analysis requires receivedAt timestamp from botPositions table',
      available: false
    };
    
    // ====================================
    // AVERAGE PNL BY ALERT STRENGTH
    // ====================================
    const strengthMap = new Map<string, { total: number; wins: number; pnl: number }>();
    
    enrichedPositions.forEach(pos => {
      if (!pos.alertParsed?.strength) return;
      
      const strength = pos.alertParsed.strength;
      let bucket = '';
      
      if (strength < 0.3) bucket = '0.0-0.3';
      else if (strength < 0.5) bucket = '0.3-0.5';
      else if (strength < 0.7) bucket = '0.5-0.7';
      else bucket = '0.7-1.0';
      
      if (!strengthMap.has(bucket)) {
        strengthMap.set(bucket, { total: 0, wins: 0, pnl: 0 });
      }
      const strengthData = strengthMap.get(bucket)!;
      strengthData.total++;
      if (pos.pnl > 0) strengthData.wins++;
      strengthData.pnl += pos.pnl;
    });
    
    const pnlByStrength = Array.from(strengthMap.entries()).map(([bucket, data]) => ({
      strengthRange: bucket,
      totalTrades: data.total,
      winningTrades: data.wins,
      losingTrades: data.total - data.wins,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => a.strengthRange.localeCompare(b.strengthRange));
    
    // ====================================
    // WIN RATE BY SESSION (NY, London, Asian)
    // ====================================
    const sessionMap = new Map<string, { total: number; wins: number; pnl: number }>();
    
    enrichedPositions.forEach(pos => {
      if (!pos.alertParsed) return;
      
      const session = pos.alertParsed.timing?.session || pos.alertParsed.session || 'Unknown';
      
      if (!sessionMap.has(session)) {
        sessionMap.set(session, { total: 0, wins: 0, pnl: 0 });
      }
      const sessionData = sessionMap.get(session)!;
      sessionData.total++;
      if (pos.pnl > 0) sessionData.wins++;
      sessionData.pnl += pos.pnl;
    });
    
    const winRateBySession = Array.from(sessionMap.entries()).map(([session, data]) => ({
      session,
      totalTrades: data.total,
      winningTrades: data.wins,
      losingTrades: data.total - data.wins,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL);
    
    // ====================================
    // WIN RATE BY REGIME
    // ====================================
    const regimeMap = new Map<string, { total: number; wins: number; pnl: number }>();
    
    enrichedPositions.forEach(pos => {
      if (!pos.alertParsed) return;
      
      const regime = pos.alertParsed.smcContext?.regime || pos.alertParsed.regime || 'Unknown';
      
      if (!regimeMap.has(regime)) {
        regimeMap.set(regime, { total: 0, wins: 0, pnl: 0 });
      }
      const regimeData = regimeMap.get(regime)!;
      regimeData.total++;
      if (pos.pnl > 0) regimeData.wins++;
      regimeData.pnl += pos.pnl;
    });
    
    const winRateByRegime = Array.from(regimeMap.entries()).map(([regime, data]) => ({
      regime,
      totalTrades: data.total,
      winningTrades: data.wins,
      losingTrades: data.total - data.wins,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => b.totalPnL - a.totalPnL);
    
    // ====================================
    // AVERAGE DURATION BY OUTCOME
    // ====================================
    const winPositions = enrichedPositions.filter(p => p.pnl > 0 && p.durationMinutes);
    const lossPositions = enrichedPositions.filter(p => p.pnl < 0 && p.durationMinutes);
    
    const avgWinDuration = winPositions.length > 0
      ? winPositions.reduce((sum, p) => sum + (p.durationMinutes || 0), 0) / winPositions.length
      : 0;
    
    const avgLossDuration = lossPositions.length > 0
      ? lossPositions.reduce((sum, p) => sum + (p.durationMinutes || 0), 0) / lossPositions.length
      : 0;
    
    const durationAnalysis = {
      avgWinDurationMinutes: avgWinDuration,
      avgLossDurationMinutes: avgLossDuration,
      winDurationHours: avgWinDuration / 60,
      lossDurationHours: avgLossDuration / 60
    };
    
    // ====================================
    // TP HIT ANALYSIS
    // ====================================
    const tpHitStats = {
      tp1Only: enrichedPositions.filter(p => p.tp1Hit && !p.tp2Hit && !p.tp3Hit).length,
      tp1AndTp2: enrichedPositions.filter(p => p.tp1Hit && p.tp2Hit && !p.tp3Hit).length,
      allTPs: enrichedPositions.filter(p => p.tp1Hit && p.tp2Hit && p.tp3Hit).length,
      noTP: enrichedPositions.filter(p => !p.tp1Hit && !p.tp2Hit && !p.tp3Hit).length,
      avgPnlTp1Only: 0,
      avgPnlTp1AndTp2: 0,
      avgPnlAllTPs: 0,
      avgPnlNoTP: 0
    };
    
    const tp1OnlyPositions = enrichedPositions.filter(p => p.tp1Hit && !p.tp2Hit && !p.tp3Hit);
    const tp1AndTp2Positions = enrichedPositions.filter(p => p.tp1Hit && p.tp2Hit && !p.tp3Hit);
    const allTPsPositions = enrichedPositions.filter(p => p.tp1Hit && p.tp2Hit && p.tp3Hit);
    const noTPPositions = enrichedPositions.filter(p => !p.tp1Hit && !p.tp2Hit && !p.tp3Hit);
    
    tpHitStats.avgPnlTp1Only = tp1OnlyPositions.length > 0
      ? tp1OnlyPositions.reduce((sum, p) => sum + p.pnl, 0) / tp1OnlyPositions.length
      : 0;
    
    tpHitStats.avgPnlTp1AndTp2 = tp1AndTp2Positions.length > 0
      ? tp1AndTp2Positions.reduce((sum, p) => sum + p.pnl, 0) / tp1AndTp2Positions.length
      : 0;
    
    tpHitStats.avgPnlAllTPs = allTPsPositions.length > 0
      ? allTPsPositions.reduce((sum, p) => sum + p.pnl, 0) / allTPsPositions.length
      : 0;
    
    tpHitStats.avgPnlNoTP = noTPPositions.length > 0
      ? noTPPositions.reduce((sum, p) => sum + p.pnl, 0) / noTPPositions.length
      : 0;
    
    // ====================================
    // MTF AGREEMENT ANALYSIS
    // ====================================
    const mtfMap = new Map<string, { total: number; wins: number; pnl: number }>();
    
    enrichedPositions.forEach(pos => {
      if (!pos.alertParsed?.technical?.mtfAgreement && !pos.alertParsed?.mtfAgreement) return;
      
      const mtf = pos.alertParsed.technical?.mtfAgreement || pos.alertParsed.mtfAgreement;
      let bucket = '';
      
      if (mtf < 0.4) bucket = '0.0-0.4';
      else if (mtf < 0.6) bucket = '0.4-0.6';
      else if (mtf < 0.8) bucket = '0.6-0.8';
      else bucket = '0.8-1.0';
      
      if (!mtfMap.has(bucket)) {
        mtfMap.set(bucket, { total: 0, wins: 0, pnl: 0 });
      }
      const mtfData = mtfMap.get(bucket)!;
      mtfData.total++;
      if (pos.pnl > 0) mtfData.wins++;
      mtfData.pnl += pos.pnl;
    });
    
    const winRateByMTF = Array.from(mtfMap.entries()).map(([bucket, data]) => ({
      mtfRange: bucket,
      totalTrades: data.total,
      winningTrades: data.wins,
      losingTrades: data.total - data.wins,
      winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      avgPnL: data.total > 0 ? data.pnl / data.total : 0,
      totalPnL: data.pnl
    })).sort((a, b) => a.mtfRange.localeCompare(b.mtfRange));
    
    // ====================================
    // CLOSE REASON DISTRIBUTION
    // ====================================
    const closeReasonMap = new Map<string, { total: number; avgPnL: number; totalPnL: number }>();
    
    enrichedPositions.forEach(pos => {
      const reason = pos.closeReason || 'Unknown';
      if (!closeReasonMap.has(reason)) {
        closeReasonMap.set(reason, { total: 0, avgPnL: 0, totalPnL: 0 });
      }
      const reasonData = closeReasonMap.get(reason)!;
      reasonData.total++;
      reasonData.totalPnL += pos.pnl;
    });
    
    const closeReasonDistribution = Array.from(closeReasonMap.entries()).map(([reason, data]) => ({
      closeReason: reason,
      count: data.total,
      percentage: (data.total / positions.length) * 100,
      avgPnL: data.total > 0 ? data.totalPnL / data.total : 0,
      totalPnL: data.totalPnL
    })).sort((a, b) => b.count - a.count);
    
    // ====================================
    // RETURN RESPONSE
    // ====================================
    return NextResponse.json({
      success: true,
      totalPositions: positions.length,
      analyzedAt: new Date().toISOString(),
      filters: {
        days: daysParam ? parseInt(daysParam) : null,
        allTime: !daysParam
      },
      stats: {
        winRateByTier,
        winRateByConfirmation,
        pnlByStrength,
        winRateBySession,
        winRateByRegime,
        winRateByMTF,
        durationAnalysis,
        tpHitStats,
        closeReasonDistribution,
        latencyStats
      }
    });
    
  } catch (error) {
    console.error('[AI Stats] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
