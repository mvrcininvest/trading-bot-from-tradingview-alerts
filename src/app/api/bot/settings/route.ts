import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resetCloudFrontLock } from '@/lib/cloudfront-guard';

const VALID_POSITION_SIZE_MODES = ['percent', 'fixed_amount'];
const VALID_LEVERAGE_MODES = ['from_alert', 'fixed'];
const VALID_TIER_FILTERING_MODES = ['all', 'custom'];
const VALID_TP_STRATEGIES = ['multiple', 'main_only'];
const VALID_SAME_SYMBOL_BEHAVIORS = ['ignore', 'track_confirmations', 'upgrade_tp', 'emergency_override'];
const VALID_OPPOSITE_DIRECTION_STRATEGIES = ['market_reversal', 'immediate_reverse', 'defensive_close', 'ignore_opposite', 'tier_based'];
const VALID_EMERGENCY_OVERRIDE_MODES = ['always', 'only_profit', 'profit_above_x', 'never'];
const VALID_SL_MANAGEMENT_MODES = ['breakeven', 'trailing', 'no_change'];
const VALID_TP_MODES = ['percent', 'rr'];

// ✅ NEW: Phone number validation helper
function validateE164Format(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

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

    // ✅ RESET CLOUDFRONT LOCK when user enables bot
    if (body.botEnabled === true) {
      console.log('[Bot Settings] User is enabling bot - checking CloudFront lock...');
      await resetCloudFrontLock();
    }

    // Validate positionSizeMode
    if (body.positionSizeMode !== undefined && !VALID_POSITION_SIZE_MODES.includes(body.positionSizeMode)) {
      return NextResponse.json({ 
        error: `Invalid positionSizeMode. Must be one of: ${VALID_POSITION_SIZE_MODES.join(', ')}`,
        code: 'INVALID_POSITION_SIZE_MODE',
        field: 'positionSizeMode'
      }, { status: 400 });
    }

    // ✅ NEW: Validate tpMode
    if (body.tpMode !== undefined && !VALID_TP_MODES.includes(body.tpMode)) {
      return NextResponse.json({
        error: `Invalid tpMode. Must be one of: ${VALID_TP_MODES.join(', ')}`,
        code: 'INVALID_TP_MODE',
        field: 'tpMode'
      }, { status: 400 });
    }

    // ✅ NEW: Conflict validation - Adaptive R:R only works with "rr" mode
    if (body.adaptiveRR === true && body.tpMode === "percent") {
      return NextResponse.json({
        error: 'Adaptive R:R can only be enabled when tpMode is "rr". Please change TP mode to "R:R od entry".',
        code: 'INVALID_ADAPTIVE_RR_CONFIG',
        field: 'adaptiveRR'
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

    // Validate NEW TP Strategy fields
    if (body.tpCount !== undefined) {
      const tpCount = parseInt(body.tpCount);
      if (isNaN(tpCount) || tpCount < 1 || tpCount > 3) {
        return NextResponse.json({
          error: 'tpCount must be 1, 2, or 3',
          code: 'INVALID_TP_COUNT',
          field: 'tpCount'
        }, { status: 400 });
      }
    }

    if (body.tp1RR !== undefined) {
      const tp1RR = parseFloat(body.tp1RR);
      if (isNaN(tp1RR) || tp1RR <= 0) {
        return NextResponse.json({
          error: 'tp1RR must be greater than 0',
          code: 'INVALID_TP1_RR',
          field: 'tp1RR'
        }, { status: 400 });
      }
    }

    if (body.tp2RR !== undefined) {
      const tp2RR = parseFloat(body.tp2RR);
      if (isNaN(tp2RR) || tp2RR <= 0) {
        return NextResponse.json({
          error: 'tp2RR must be greater than 0',
          code: 'INVALID_TP2_RR',
          field: 'tp2RR'
        }, { status: 400 });
      }
    }

    if (body.tp3RR !== undefined) {
      const tp3RR = parseFloat(body.tp3RR);
      if (isNaN(tp3RR) || tp3RR <= 0) {
        return NextResponse.json({
          error: 'tp3RR must be greater than 0',
          code: 'INVALID_TP3_RR',
          field: 'tp3RR'
        }, { status: 400 });
      }
    }

    if (body.tp1Percent !== undefined) {
      const tp1Percent = parseFloat(body.tp1Percent);
      if (isNaN(tp1Percent) || tp1Percent <= 0 || tp1Percent > 100) {
        return NextResponse.json({
          error: 'tp1Percent must be between 0 and 100',
          code: 'INVALID_TP1_PERCENT',
          field: 'tp1Percent'
        }, { status: 400 });
      }
    }

    if (body.tp2Percent !== undefined) {
      const tp2Percent = parseFloat(body.tp2Percent);
      if (isNaN(tp2Percent) || tp2Percent <= 0 || tp2Percent > 100) {
        return NextResponse.json({
          error: 'tp2Percent must be between 0 and 100',
          code: 'INVALID_TP2_PERCENT',
          field: 'tp2Percent'
        }, { status: 400 });
      }
    }

    if (body.tp3Percent !== undefined) {
      const tp3Percent = parseFloat(body.tp3Percent);
      if (isNaN(tp3Percent) || tp3Percent <= 0 || tp3Percent > 100) {
        return NextResponse.json({
          error: 'tp3Percent must be between 0 and 100',
          code: 'INVALID_TP3_PERCENT',
          field: 'tp3Percent'
        }, { status: 400 });
      }
    }

    if (body.slManagementAfterTp1 !== undefined && !VALID_SL_MANAGEMENT_MODES.includes(body.slManagementAfterTp1)) {
      return NextResponse.json({
        error: `Invalid slManagementAfterTp1. Must be one of: ${VALID_SL_MANAGEMENT_MODES.join(', ')}`,
        code: 'INVALID_SL_MANAGEMENT',
        field: 'slManagementAfterTp1'
      }, { status: 400 });
    }

    if (body.slTrailingDistance !== undefined) {
      const distance = parseFloat(body.slTrailingDistance);
      if (isNaN(distance) || distance < 0) {
        return NextResponse.json({
          error: 'slTrailingDistance must be greater than or equal to 0',
          code: 'INVALID_SL_TRAILING_DISTANCE',
          field: 'slTrailingDistance'
        }, { status: 400 });
      }
    }

    // ✅ NEW: Validate SMS Alert fields
    if (body.smsAlertsEnabled === true) {
      // Check phone number
      if (!body.alertPhoneNumber || body.alertPhoneNumber.trim() === '') {
        return NextResponse.json({
          error: 'alertPhoneNumber is required when SMS alerts are enabled',
          code: 'MISSING_ALERT_PHONE',
          field: 'alertPhoneNumber'
        }, { status: 400 });
      }

      if (!validateE164Format(body.alertPhoneNumber)) {
        return NextResponse.json({
          error: 'alertPhoneNumber must be in E.164 format (e.g., +48123456789)',
          code: 'INVALID_PHONE_FORMAT',
          field: 'alertPhoneNumber'
        }, { status: 400 });
      }

      // Check Twilio credentials
      if (!body.twilioAccountSid || body.twilioAccountSid.trim() === '') {
        return NextResponse.json({
          error: 'twilioAccountSid is required when SMS alerts are enabled',
          code: 'MISSING_TWILIO_SID',
          field: 'twilioAccountSid'
        }, { status: 400 });
      }

      if (!body.twilioAuthToken || body.twilioAuthToken.trim() === '') {
        return NextResponse.json({
          error: 'twilioAuthToken is required when SMS alerts are enabled',
          code: 'MISSING_TWILIO_TOKEN',
          field: 'twilioAuthToken'
        }, { status: 400 });
      }

      if (!body.twilioPhoneNumber || body.twilioPhoneNumber.trim() === '') {
        return NextResponse.json({
          error: 'twilioPhoneNumber is required when SMS alerts are enabled',
          code: 'MISSING_TWILIO_PHONE',
          field: 'twilioPhoneNumber'
        }, { status: 400 });
      }

      if (!validateE164Format(body.twilioPhoneNumber)) {
        return NextResponse.json({
          error: 'twilioPhoneNumber must be in E.164 format (e.g., +1234567890)',
          code: 'INVALID_TWILIO_PHONE_FORMAT',
          field: 'twilioPhoneNumber'
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
    if (body.adaptiveRR !== undefined) {
      updates.adaptiveRR = body.adaptiveRR;
    }
    if (body.slAsMarginPercent !== undefined) {
      updates.slAsMarginPercent = body.slAsMarginPercent;
    }

    // Oko Saurona boolean fields
    if (body.okoEnabled !== undefined) {
      updates.okoEnabled = body.okoEnabled;
    }
    if (body.okoAccountDrawdownCloseAll !== undefined) {
      updates.okoAccountDrawdownCloseAll = body.okoAccountDrawdownCloseAll;
    }
    if (body.okoTimeBasedExitEnabled !== undefined) {
      updates.okoTimeBasedExitEnabled = body.okoTimeBasedExitEnabled;
    }

    // ✅ NEW: SMS Alert boolean field
    if (body.smsAlertsEnabled !== undefined) {
      updates.smsAlertsEnabled = body.smsAlertsEnabled;
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

    // ✅ NEW: Enhanced TP Strategy fields
    if (body.tpMode !== undefined) updates.tpMode = body.tpMode;
    if (body.tpCount !== undefined) updates.tpCount = parseInt(body.tpCount);
    if (body.tp1RR !== undefined) updates.tp1RR = parseFloat(body.tp1RR);
    if (body.tp1Percent !== undefined) updates.tp1Percent = parseFloat(body.tp1Percent);
    if (body.tp2RR !== undefined) updates.tp2RR = parseFloat(body.tp2RR);
    if (body.tp2Percent !== undefined) updates.tp2Percent = parseFloat(body.tp2Percent);
    if (body.tp3RR !== undefined) updates.tp3RR = parseFloat(body.tp3RR);
    if (body.tp3Percent !== undefined) updates.tp3Percent = parseFloat(body.tp3Percent);
    if (body.slManagementAfterTp1 !== undefined) updates.slManagementAfterTp1 = body.slManagementAfterTp1;
    if (body.slTrailingDistance !== undefined) updates.slTrailingDistance = parseFloat(body.slTrailingDistance);

    // ✅ NEW: Adaptive R:R fields
    if (body.adaptiveMultiplier !== undefined) updates.adaptiveMultiplier = parseFloat(body.adaptiveMultiplier);
    if (body.adaptiveStrengthThreshold !== undefined) updates.adaptiveStrengthThreshold = parseFloat(body.adaptiveStrengthThreshold);

    // ✅ NEW: SL as margin fields
    if (body.slMarginRiskPercent !== undefined) updates.slMarginRiskPercent = parseFloat(body.slMarginRiskPercent);

    // Oko Saurona settings
    if (body.okoCheckFrequencySeconds !== undefined) updates.okoCheckFrequencySeconds = parseInt(body.okoCheckFrequencySeconds);
    if (body.okoAccountDrawdownPercent !== undefined) updates.okoAccountDrawdownPercent = parseFloat(body.okoAccountDrawdownPercent);
    if (body.okoAccountDrawdownChecks !== undefined) updates.okoAccountDrawdownChecks = parseInt(body.okoAccountDrawdownChecks);
    if (body.okoTimeBasedExitHours !== undefined) updates.okoTimeBasedExitHours = parseInt(body.okoTimeBasedExitHours);
    if (body.okoCapitulationBanDurationHours !== undefined) updates.okoCapitulationBanDurationHours = parseInt(body.okoCapitulationBanDurationHours);
    if (body.okoCapitulationChecks !== undefined) updates.okoCapitulationChecks = parseInt(body.okoCapitulationChecks);

    // ✅ NEW: SMS Alert fields
    if (body.alertPhoneNumber !== undefined) updates.alertPhoneNumber = body.alertPhoneNumber;
    if (body.twilioAccountSid !== undefined) updates.twilioAccountSid = body.twilioAccountSid;
    if (body.twilioAuthToken !== undefined) updates.twilioAuthToken = body.twilioAuthToken;
    if (body.twilioPhoneNumber !== undefined) updates.twilioPhoneNumber = body.twilioPhoneNumber;

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