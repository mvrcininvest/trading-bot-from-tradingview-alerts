import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { desc } from 'drizzle-orm';

/**
 * 🤖 ML MODEL INTEGRATION
 * 
 * Endpoint for AI/ML predictions based on historical trading data.
 * Uses simple statistical models for now, can be extended with actual ML models.
 * 
 * POST /api/ml/predict
 * Body: { symbol, side, tier, strength, regime, session, mtfAgreement, ... }
 * 
 * Returns: { prediction, confidence, recommendation, reasoning }
 */

interface PredictionInput {
  symbol?: string;
  side?: string;
  tier?: string;
  strength?: number;
  regime?: string;
  session?: string;
  mtfAgreement?: number;
  confirmationCount?: number;
  atr?: number;
  volumeRatio?: number;
}

interface PredictionOutput {
  prediction: 'WIN' | 'LOSS' | 'UNCERTAIN';
  confidence: number;
  expectedPnL: number;
  expectedPnLPercent: number;
  recommendation: 'TAKE' | 'SKIP' | 'CAUTIOUS';
  reasoning: string[];
  modelVersion: string;
  basedOnSamples: number;
}

export async function POST(request: NextRequest) {
  try {
    const input: PredictionInput = await request.json();
    
    console.log('[ML Predict] Input:', input);
    
    // Fetch all historical positions
    const allPositions = await db
      .select()
      .from(positionHistory)
      .orderBy(desc(positionHistory.closedAt));
    
    if (allPositions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No historical data available for predictions'
      }, { status: 400 });
    }
    
    // Parse alert data
    const positionsWithAlerts = allPositions.map(pos => {
      let alertData: any = null;
      if (pos.alertData) {
        try {
          alertData = JSON.parse(pos.alertData);
        } catch (e) {
          // Skip
        }
      }
      return { ...pos, alertData };
    }).filter(p => p.alertData !== null);
    
    console.log(`[ML Predict] Found ${positionsWithAlerts.length} positions with alert data`);
    
    // Filter similar positions based on input parameters
    let similarPositions = positionsWithAlerts;
    
    if (input.symbol) {
      similarPositions = similarPositions.filter(p => p.symbol === input.symbol);
    }
    
    if (input.side) {
      similarPositions = similarPositions.filter(p => p.side === input.side);
    }
    
    if (input.tier) {
      similarPositions = similarPositions.filter(p => p.tier === input.tier);
    }
    
    if (input.regime) {
      similarPositions = similarPositions.filter(p => 
        p.alertData?.smcContext?.regime === input.regime || 
        p.alertData?.regime === input.regime
      );
    }
    
    if (input.session) {
      similarPositions = similarPositions.filter(p => 
        p.alertData?.timing?.session === input.session || 
        p.alertData?.session === input.session
      );
    }
    
    console.log(`[ML Predict] Found ${similarPositions.length} similar positions`);
    
    // If no similar positions, use broader dataset
    if (similarPositions.length < 10) {
      console.log('[ML Predict] Not enough similar positions, using broader dataset');
      similarPositions = positionsWithAlerts;
    }
    
    // Calculate statistics
    const totalSamples = similarPositions.length;
    const winningTrades = similarPositions.filter(p => p.pnl > 0).length;
    const losingTrades = similarPositions.filter(p => p.pnl < 0).length;
    const winRate = (winningTrades / totalSamples) * 100;
    
    const avgPnL = similarPositions.reduce((sum, p) => sum + p.pnl, 0) / totalSamples;
    const avgPnLPercent = similarPositions.reduce((sum, p) => sum + (p.pnlPercent || 0), 0) / totalSamples;
    
    const avgWinPnL = similarPositions
      .filter(p => p.pnl > 0)
      .reduce((sum, p) => sum + p.pnl, 0) / (winningTrades || 1);
    
    const avgLossPnL = Math.abs(
      similarPositions
        .filter(p => p.pnl < 0)
        .reduce((sum, p) => sum + p.pnl, 0) / (losingTrades || 1)
    );
    
    // 🤖 ML PREDICTION LOGIC
    
    // Base prediction on win rate
    let prediction: 'WIN' | 'LOSS' | 'UNCERTAIN' = 'UNCERTAIN';
    let confidence = 0;
    
    if (winRate >= 60) {
      prediction = 'WIN';
      confidence = Math.min(winRate, 95);
    } else if (winRate <= 40) {
      prediction = 'LOSS';
      confidence = Math.min(100 - winRate, 95);
    } else {
      prediction = 'UNCERTAIN';
      confidence = 50;
    }
    
    // Adjust confidence based on sample size
    if (totalSamples < 20) {
      confidence *= 0.7; // Reduce confidence for small samples
    } else if (totalSamples < 50) {
      confidence *= 0.85;
    }
    
    // Adjust confidence based on input quality
    const inputQualityScore = [
      input.strength ? (input.strength > 0.6 ? 1 : 0.5) : 0.5,
      input.mtfAgreement ? (input.mtfAgreement > 0.7 ? 1 : 0.5) : 0.5,
      input.confirmationCount ? (input.confirmationCount >= 3 ? 1 : 0.5) : 0.5,
    ].reduce((sum, val) => sum + val, 0) / 3;
    
    confidence = confidence * inputQualityScore;
    
    // Generate recommendation
    let recommendation: 'TAKE' | 'SKIP' | 'CAUTIOUS' = 'CAUTIOUS';
    
    if (prediction === 'WIN' && confidence >= 70 && avgPnL > 0) {
      recommendation = 'TAKE';
    } else if (prediction === 'LOSS' && confidence >= 60) {
      recommendation = 'SKIP';
    } else {
      recommendation = 'CAUTIOUS';
    }
    
    // Generate reasoning
    const reasoning: string[] = [];
    
    reasoning.push(`Based on ${totalSamples} similar historical trades`);
    reasoning.push(`Win rate: ${winRate.toFixed(1)}% (${winningTrades} wins, ${losingTrades} losses)`);
    reasoning.push(`Average PnL: ${avgPnL >= 0 ? '+' : ''}${avgPnL.toFixed(2)} USDT (${avgPnLPercent.toFixed(2)}%)`);
    
    if (input.tier) {
      const tierWinRate = similarPositions.filter(p => p.tier === input.tier && p.pnl > 0).length / 
                         similarPositions.filter(p => p.tier === input.tier).length * 100;
      reasoning.push(`Tier "${input.tier}" has ${tierWinRate.toFixed(1)}% win rate`);
    }
    
    if (avgWinPnL > avgLossPnL * 1.5) {
      reasoning.push(`✅ Favorable risk/reward: Avg win ${avgWinPnL.toFixed(2)} vs avg loss ${avgLossPnL.toFixed(2)}`);
    } else if (avgWinPnL < avgLossPnL) {
      reasoning.push(`⚠️ Unfavorable risk/reward: Avg win ${avgWinPnL.toFixed(2)} vs avg loss ${avgLossPnL.toFixed(2)}`);
    }
    
    if (recommendation === 'TAKE') {
      reasoning.push(`🚀 Strong positive expectancy - recommended to take this trade`);
    } else if (recommendation === 'SKIP') {
      reasoning.push(`🛑 Negative expectancy - recommended to skip this trade`);
    } else {
      reasoning.push(`⚠️ Mixed signals - proceed with caution or reduce position size`);
    }
    
    const result: PredictionOutput = {
      prediction,
      confidence: Math.round(confidence * 100) / 100,
      expectedPnL: avgPnL,
      expectedPnLPercent: avgPnLPercent,
      recommendation,
      reasoning,
      modelVersion: 'v1.0-statistical',
      basedOnSamples: totalSamples
    };
    
    console.log('[ML Predict] Result:', result);
    
    return NextResponse.json({
      success: true,
      prediction: result
    });
    
  } catch (error) {
    console.error('[ML Predict] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * GET - Model information and health check
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'online',
    modelVersion: 'v1.0-statistical',
    description: 'ML prediction endpoint for trading bot',
    features: [
      'Win rate prediction based on historical data',
      'Expected PnL estimation',
      'Trade recommendation (TAKE/SKIP/CAUTIOUS)',
      'Contextual reasoning'
    ]
  });
}
