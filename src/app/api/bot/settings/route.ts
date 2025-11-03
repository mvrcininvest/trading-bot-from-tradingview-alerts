import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const VALID_POSITION_SIZE_MODES = ['percent', 'fixed_amount'];
const VALID_LEVERAGE_MODES = ['from_alert', 'fixed'];
const VALID_TIER_FILTERING_MODES = ['all', 'custom'];
const VALID_TP_STRATEGIES = ['multiple', 'main_only'];
const VALID_SAME_SYMBOL_BEHAVIORS = ['ignore', 'track_confirmations', 'upgrade_tp', 'emergency_override'];
const VALID_OPPOSITE_DIRECTION_STRATEGIES = ['market_reversal', 'immediate_reverse', 'defensive_close', 'ignore_opposite', 'tier_based'];
const VALID_EMERGENCY_OVERRIDE_MODES = ['always', 'only_profit', 'profit_above_x', 'never'];

export async function GET(request: NextRequest) {
  try {
    const settings = await db.select()
      .from(botSettings)
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({ 
        error: 'Bot settings not found',
        code: 'SETTINGS_NOT_FOUND' 
      }, { status: 404 });
    }

    return NextResponse.json({ success: true, settings: settings[0] }, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

async function updateSettings(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if settings exist
    const existingSettings = await db.select()
      .from(botSettings)
      .limit(1);

    if (existingSettings.length === 0) {
      return NextResponse.json({ 
        error: 'Bot settings not found. Cannot update non-existent settings.',
        code: 'SETTINGS_NOT_FOUND' 
      }, { status: 404 });
    }

    // Validate positionSizeMode
    if (body.positionSizeMode !== undefined && !VALID_POSITION_SIZE_MODES.includes(body.positionSizeMode)) {
      return NextResponse.json({ 
        error: `Invalid positionSizeMode. Must be one of: ${VALID_POSITION_SIZE_MODES.join(', ')}`,
        code: 'INVALID_POSITION_SIZE_MODE',
        field: 'positionSizeMode'
      }, { status: 400 });
    }

    // Validate leverageMode
    if (body.leverageMode !== undefined && !VALID_LEVERAGE_MODES.includes(body.leverageMode)) {
      return NextResponse.json({ 
        error: `Invalid leverageMode. Must be one of: ${VALID_LEVERAGE_MODES.join(', ')}`,
        code: 'INVALID_LEVERAGE_MODE',
        field: 'leverageMode'
      }, { status: 400 });
    }

    // Validate tierFilteringMode
    if (body.tierFilteringMode !== undefined && !VALID_TIER_FILTERING_MODES.includes(body.tierFilteringMode)) {
      return NextResponse.json({ 
        error: `Invalid tierFilteringMode. Must be one of: ${VALID_TIER_FILTERING_MODES.join(', ')}`,
        code: 'INVALID_TIER_FILTERING_MODE',
        field: 'tierFilteringMode'
      }, { status: 400 });
    }

    // Validate tpStrategy
    if (body.tpStrategy !== undefined && !VALID_TP_STRATEGIES.includes(body.tpStrategy)) {
      return NextResponse.json({ 
        error: `Invalid tpStrategy. Must be one of: ${VALID_TP_STRATEGIES.join(', ')}`,
        code: 'INVALID_TP_STRATEGY',
        field: 'tpStrategy'
      }, { status: 400 });
    }

    // Validate sameSymbolBehavior
    if (body.sameSymbolBehavior !== undefined && !VALID_SAME_SYMBOL_BEHAVIORS.includes(body.sameSymbolBehavior)) {
      return NextResponse.json({ 
        error: `Invalid sameSymbolBehavior. Must be one of: ${VALID_SAME_SYMBOL_BEHAVIORS.join(', ')}`,
        code: 'INVALID_SAME_SYMBOL_BEHAVIOR',
        field: 'sameSymbolBehavior'
      }, { status: 400 });
    }

    // Validate oppositeDirectionStrategy
    if (body.oppositeDirectionStrategy !== undefined && !VALID_OPPOSITE_DIRECTION_STRATEGIES.includes(body.oppositeDirectionStrategy)) {
      return NextResponse.json({ 
        error: `Invalid oppositeDirectionStrategy. Must be one of: ${VALID_OPPOSITE_DIRECTION_STRATEGIES.join(', ')}`,
        code: 'INVALID_OPPOSITE_DIRECTION_STRATEGY',
        field: 'oppositeDirectionStrategy'
      }, { status: 400 });
    }

    // Validate emergencyOverrideMode
    if (body.emergencyOverrideMode !== undefined && !VALID_EMERGENCY_OVERRIDE_MODES.includes(body.emergencyOverrideMode)) {
      return NextResponse.json({ 
        error: `Invalid emergencyOverrideMode. Must be one of: ${VALID_EMERGENCY_OVERRIDE_MODES.join(', ')}`,
        code: 'INVALID_EMERGENCY_OVERRIDE_MODE',
        field: 'emergencyOverrideMode'
      }, { status: 400 });
    }

    // Validate reversalWaitBars
    if (body.reversalWaitBars !== undefined) {
      const waitBars = parseInt(body.reversalWaitBars);
      if (isNaN(waitBars) || waitBars < 1 || waitBars > 3) {
        return NextResponse.json({ 
          error: 'reversalWaitBars must be between 1 and 3',
          code: 'INVALID_REVERSAL_WAIT_BARS',
          field: 'reversalWaitBars'
        }, { status: 400 });
      }
    }

    // Validate positionSizePercent
    if (body.positionSizePercent !== undefined) {
      const percent = parseFloat(body.positionSizePercent);
      if (isNaN(percent) || percent <= 0 || percent > 100) {
        return NextResponse.json({ 
          error: 'positionSizePercent must be greater than 0 and less than or equal to 100',
          code: 'INVALID_POSITION_SIZE_PERCENT',
          field: 'positionSizePercent'
        }, { status: 400 });
      }
    }

    // Validate leverageFixed
    if (body.leverageFixed !== undefined) {
      const leverage = parseInt(body.leverageFixed);
      if (isNaN(leverage) || leverage <= 0) {
        return NextResponse.json({ 
          error: 'leverageFixed must be greater than 0',
          code: 'INVALID_LEVERAGE_FIXED',
          field: 'leverageFixed'
        }, { status: 400 });
      }
    }

    // Validate maxConcurrentPositions
    if (body.maxConcurrentPositions !== undefined) {
      const maxPositions = parseInt(body.maxConcurrentPositions);
      if (isNaN(maxPositions) || maxPositions <= 0) {
        return NextResponse.json({ 
          error: 'maxConcurrentPositions must be greater than 0',
          code: 'INVALID_MAX_CONCURRENT_POSITIONS',
          field: 'maxConcurrentPositions'
        }, { status: 400 });
      }
    }

    // Validate RR fields
    if (body.defaultSlRR !== undefined) {
      const slRR = parseFloat(body.defaultSlRR);
      if (isNaN(slRR) || slRR <= 0) {
        return NextResponse.json({
          error: 'defaultSlRR must be greater than 0',
          code: 'INVALID_DEFAULT_SL_RR',
          field: 'defaultSlRR'
        }, { status: 400 });
      }
    }

    if (body.defaultTp1RR !== undefined) {
      const tp1RR = parseFloat(body.defaultTp1RR);
      if (isNaN(tp1RR) || tp1RR <= 0) {
        return NextResponse.json({
          error: 'defaultTp1RR must be greater than 0',
          code: 'INVALID_DEFAULT_TP1_RR',
          field: 'defaultTp1RR'
        }, { status: 400 });
      }
    }

    if (body.defaultTp2RR !== undefined) {
      const tp2RR = parseFloat(body.defaultTp2RR);
      if (isNaN(tp2RR) || tp2RR <= 0) {
        return NextResponse.json({
          error: 'defaultTp2RR must be greater than 0',
          code: 'INVALID_DEFAULT_TP2_RR',
          field: 'defaultTp2RR'
        }, { status: 400 });
      }
    }

    if (body.defaultTp3RR !== undefined) {
      const tp3RR = parseFloat(body.defaultTp3RR);
      if (isNaN(tp3RR) || tp3RR <= 0) {
        return NextResponse.json({
          error: 'defaultTp3RR must be greater than 0',
          code: 'INVALID_DEFAULT_TP3_RR',
          field: 'defaultTp3RR'
        }, { status: 400 });
      }
    }

    // Build update object with only provided fields
    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    // Map boolean fields correctly
    if (body.botEnabled !== undefined) {
      updates.botEnabled = body.botEnabled;
    }
    if (body.emergencyCanReverse !== undefined) {
      updates.emergencyCanReverse = body.emergencyCanReverse;
    }
    if (body.useDefaultSlTp !== undefined) {
      updates.useDefaultSlTp = body.useDefaultSlTp;
    }

    // Map other fields
    if (body.positionSizeMode !== undefined) updates.positionSizeMode = body.positionSizeMode;
    if (body.positionSizePercent !== undefined) updates.positionSizePercent = parseFloat(body.positionSizePercent);
    if (body.positionSizeFixed !== undefined) updates.positionSizeFixed = parseFloat(body.positionSizeFixed);
    if (body.leverageMode !== undefined) updates.leverageMode = body.leverageMode;
    if (body.leverageFixed !== undefined) updates.leverageFixed = parseInt(body.leverageFixed);
    if (body.tierFilteringMode !== undefined) updates.tierFilteringMode = body.tierFilteringMode;
    if (body.disabledTiers !== undefined) updates.disabledTiers = body.disabledTiers;
    if (body.tpStrategy !== undefined) updates.tpStrategy = body.tpStrategy;
    if (body.maxConcurrentPositions !== undefined) updates.maxConcurrentPositions = parseInt(body.maxConcurrentPositions);
    if (body.sameSymbolBehavior !== undefined) updates.sameSymbolBehavior = body.sameSymbolBehavior;
    if (body.oppositeDirectionStrategy !== undefined) updates.oppositeDirectionStrategy = body.oppositeDirectionStrategy;
    if (body.reversalWaitBars !== undefined) updates.reversalWaitBars = parseInt(body.reversalWaitBars);
    if (body.reversalMinStrength !== undefined) updates.reversalMinStrength = parseFloat(body.reversalMinStrength);
    if (body.emergencyOverrideMode !== undefined) updates.emergencyOverrideMode = body.emergencyOverrideMode;
    if (body.emergencyMinProfitPercent !== undefined) updates.emergencyMinProfitPercent = parseFloat(body.emergencyMinProfitPercent);
    if (body.defaultSlRR !== undefined) updates.defaultSlRR = parseFloat(body.defaultSlRR);
    if (body.defaultTp1RR !== undefined) updates.defaultTp1RR = parseFloat(body.defaultTp1RR);
    if (body.defaultTp2RR !== undefined) updates.defaultTp2RR = parseFloat(body.defaultTp2RR);
    if (body.defaultTp3RR !== undefined) updates.defaultTp3RR = parseFloat(body.defaultTp3RR);

    const settingsId = existingSettings[0].id;
    const updated = await db.update(botSettings)
      .set(updates)
      .where(eq(botSettings.id, settingsId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update bot settings',
        code: 'UPDATE_FAILED' 
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, settings: updated[0] }, { status: 200 });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return updateSettings(request);
}

export async function POST(request: NextRequest) {
  return updateSettings(request);
}