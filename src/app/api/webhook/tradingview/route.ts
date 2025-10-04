import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    // Store the raw JSON for the database
    const rawJson = JSON.stringify(requestBody);
    
    // Extract and validate required fields
    const {
      timestamp,
      symbol,
      side,
      tier,
      tier_numeric,
      strength,
      entry_price,
      sl,
      tp1,
      tp2,
      tp3,
      main_tp,
      atr,
      volume_ratio,
      session,
      regime,
      regime_confidence,
      mtf_agreement,
      leverage,
      in_ob,
      in_fvg,
      ob_score,
      fvg_score,
      institutional_flow,
      accumulation,
      volume_climax
    } = requestBody;

    // Validate required fields presence
    const requiredFields = [
      'timestamp', 'symbol', 'side', 'tier', 'tier_numeric', 'strength',
      'entry_price', 'sl', 'tp1', 'tp2', 'tp3', 'main_tp', 'atr',
      'volume_ratio', 'session', 'regime', 'regime_confidence', 'mtf_agreement',
      'leverage', 'in_ob', 'in_fvg', 'ob_score', 'fvg_score'
    ];

    for (const field of requiredFields) {
      if (requestBody[field] === undefined || requestBody[field] === null) {
        return NextResponse.json({
          error: `Required field '${field}' is missing`,
          code: "MISSING_REQUIRED_FIELD"
        }, { status: 400 });
      }
    }

    // Validate side
    if (side !== 'BUY' && side !== 'SELL') {
      return NextResponse.json({
        error: "Side must be either 'BUY' or 'SELL'",
        code: "INVALID_SIDE"
      }, { status: 400 });
    }

    // Validate tier_numeric
    if (!Number.isInteger(tier_numeric) || tier_numeric < 1 || tier_numeric > 5) {
      return NextResponse.json({
        error: "tier_numeric must be an integer between 1 and 5",
        code: "INVALID_TIER_NUMERIC"
      }, { status: 400 });
    }

    // Validate strength
    if (typeof strength !== 'number' || strength < 0.000 || strength > 1.000) {
      return NextResponse.json({
        error: "Strength must be a number between 0.000 and 1.000",
        code: "INVALID_STRENGTH"
      }, { status: 400 });
    }

    // Validate numeric fields
    const numericFields = [
      'timestamp', 'entry_price', 'sl', 'tp1', 'tp2', 'tp3', 'main_tp', 
      'atr', 'volume_ratio', 'regime_confidence', 'mtf_agreement', 
      'leverage', 'ob_score', 'fvg_score'
    ];

    for (const field of numericFields) {
      if (typeof requestBody[field] !== 'number' || isNaN(requestBody[field])) {
        return NextResponse.json({
          error: `Field '${field}' must be a valid number`,
          code: "INVALID_NUMERIC_FIELD"
        }, { status: 400 });
      }
    }

    // Validate boolean fields
    if (typeof in_ob !== 'boolean') {
      return NextResponse.json({
        error: "in_ob must be a boolean value",
        code: "INVALID_BOOLEAN_FIELD"
      }, { status: 400 });
    }

    if (typeof in_fvg !== 'boolean') {
      return NextResponse.json({
        error: "in_fvg must be a boolean value",
        code: "INVALID_BOOLEAN_FIELD"
      }, { status: 400 });
    }

    // Validate nullable numeric fields
    if (institutional_flow !== null && institutional_flow !== undefined && (typeof institutional_flow !== 'number' || isNaN(institutional_flow))) {
      return NextResponse.json({
        error: "institutional_flow must be a valid number or null",
        code: "INVALID_NUMERIC_FIELD"
      }, { status: 400 });
    }

    if (accumulation !== null && accumulation !== undefined && (typeof accumulation !== 'number' || isNaN(accumulation))) {
      return NextResponse.json({
        error: "accumulation must be a valid number or null",
        code: "INVALID_NUMERIC_FIELD"
      }, { status: 400 });
    }

    if (volume_climax !== null && volume_climax !== undefined && typeof volume_climax !== 'boolean') {
      return NextResponse.json({
        error: "volume_climax must be a boolean value or null",
        code: "INVALID_BOOLEAN_FIELD"
      }, { status: 400 });
    }

    // Calculate latency: current timestamp - (TradingView timestamp in milliseconds)
    const currentTime = Date.now();
    const tvTimeMs = timestamp * 1000; // Convert Unix timestamp to milliseconds
    const latency = currentTime - tvTimeMs;

    // Prepare data for insertion
    const alertData = {
      timestamp,
      symbol: symbol.toString().trim(),
      side: side.toString().trim(),
      tier: tier.toString().trim(),
      tierNumeric: tier_numeric,
      strength,
      entryPrice: entry_price,
      sl,
      tp1,
      tp2,
      tp3,
      mainTp: main_tp,
      atr,
      volumeRatio: volume_ratio,
      session: session.toString().trim(),
      regime: regime.toString().trim(),
      regimeConfidence: regime_confidence,
      mtfAgreement: mtf_agreement,
      leverage,
      inOb: in_ob,
      inFvg: in_fvg,
      obScore: ob_score,
      fvgScore: fvg_score,
      institutionalFlow: institutional_flow,
      accumulation: accumulation,
      volumeClimax: volume_climax,
      latency,
      rawJson,
      createdAt: new Date().toISOString()
    };

    // Insert alert into database
    const newAlert = await db.insert(alerts)
      .values(alertData)
      .returning();

    return NextResponse.json({
      message: "TradingView alert received and saved successfully",
      alert: newAlert[0],
      latency: `${latency}ms`
    }, { status: 201 });

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + error,
      code: "INTERNAL_SERVER_ERROR"
    }, { status: 500 });
  }
}