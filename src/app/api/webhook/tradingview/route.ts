import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions, botLogs, symbolLocks, botDetailedLogs, diagnosticFailures, positionHistory } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { monitorAndManagePositions } from '@/lib/position-monitor';
import { classifyError } from '@/lib/error-classifier';
import { 
  resolveConflict, 
  lockSymbolForOpening, 
  markPositionOpened, 
  markPositionOpenFailed 
} from '@/lib/conflict-resolver';
import {
  openBybitPosition,
  closeBybitPosition,
  getCurrentMarketPrice,
  getBybitPositions,
  modifyBybitTpSl,
  getRealizedPnlFromBybit
} from '@/lib/bybit-helpers';
import { validateAndAdjustPositionSize } from '@/lib/bybit-symbol-info';

// ============================================
// 🛠️ UTILITY FUNCTIONS
// ============================================

function snakeToCamel(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => snakeToCamel(v));
  } else if (obj !== null && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = snakeToCamel(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

async function logToBot(
  level: 'error' | 'warning' | 'info' | 'success',
  action: string,
  message: string,
  details?: any,
  alertId?: number,
  positionId?: number
) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    await db.insert(botLogs).values({
      timestamp,
      level,
      action,
      message,
      details: details ? JSON.stringify(details) : null,
      alertId: alertId || null,
      positionId: positionId || null,
      createdAt: timestamp,
    });
  } catch (error) {
    console.error('Failed to log to botLogs:', error);
  }
}

// ============================================
// 🔒 CHECK SYMBOL LOCKS
// ============================================

async function checkSymbolLock(symbol: string): Promise<{ locked: boolean; reason?: string }> {
  try {
    const locks = await db.select()
      .from(symbolLocks)
      .where(and(
        eq(symbolLocks.symbol, symbol),
        isNull(symbolLocks.unlockedAt)
      ))
      .limit(1);
    
    if (locks.length > 0) {
      const lock = locks[0];
      console.log(`🔒 Symbol ${symbol} is LOCKED: ${lock.lockReason}`);
      return { 
        locked: true, 
        reason: lock.lockReason 
      };
    }
    
    return { locked: false };
  } catch (error) {
    console.error('Failed to check symbol locks:', error);
    return { locked: false };
  }
}

// ============================================
// 🔍 VERIFY POSITION OPENING (UPDATED FOR BYBIT)
// ============================================

interface VerificationResult {
  success: boolean;
  discrepancies: Array<{
    field: string;
    planned: number | string;
    actual: number | string;
    diff: number;
    threshold: number;
  }>;
}

async function verifyPositionOpening(
  positionId: number,
  planned: {
    symbol: string;
    side: string;
    quantity: number;
    entryPrice: number;
    slPrice: number | null;
    tp1Price: number | null;
    tp2Price: number | null;
    tp3Price: number | null;
    leverage: number;
  },
  orderId: string,
  apiKey: string,
  apiSecret: string,
  alertId: number,
  botSettings: any
): Promise<VerificationResult> {
  console.log(`\n🔍 ========== POSITION VERIFICATION START ==========`);
  console.log(`   Position ID: ${positionId}`);
  console.log(`   Order ID: ${orderId}`);
  console.log(`   Symbol: ${planned.symbol}`);
  console.log(`   Environment: Bybit Mainnet`);
  
  const discrepancies: VerificationResult['discrepancies'] = [];
  
  // ✅ SCALPING TOLERANCES - REDUCED FOR PRECISION
  const PRICE_TOLERANCE = 0.01; // 1% for entry, SL, TP
  const QUANTITY_TOLERANCE = 0.03; // 3% for quantity
  
  console.log(`   ⚙️ Tolerances: Price ${(PRICE_TOLERANCE * 100).toFixed(1)}%, Quantity ${(QUANTITY_TOLERANCE * 100).toFixed(1)}%`);
  
  const MAX_RETRIES = 20;
  const WAIT_TIME = 2000;
  
  console.log(`   Retry config: MAX_RETRIES=${MAX_RETRIES}, WAIT_TIME=${WAIT_TIME}ms`);
  
  try {
    // Get actual position from Bybit
    console.log(`\n📊 Fetching actual position from Bybit...`);
    
    const positions = await getBybitPositions(apiKey, apiSecret, planned.symbol);
    
    if (!positions || positions.length === 0) {
      console.error(`   ❌ Position not found on exchange`);
      throw new Error(`Position not found on exchange after opening`);
    }
    
    const actualPosition = positions.find((p: any) => 
      p.symbol === planned.symbol && parseFloat(p.size) > 0
    );
    
    if (!actualPosition) {
      console.error(`   ❌ No matching position found for ${planned.symbol}`);
      throw new Error(`No matching position found for ${planned.symbol}`);
    }
    
    console.log(`   ✅ Position found on exchange`);
    
    // Extract actual values
    const actualQuantity = Math.abs(parseFloat(actualPosition.size));
    const actualEntryPrice = parseFloat(actualPosition.avgPrice);
    const actualLeverage = parseInt(actualPosition.leverage);
    const actualSlPrice = actualPosition.stopLoss ? parseFloat(actualPosition.stopLoss) : null;
    const actualTp1Price = actualPosition.takeProfit ? parseFloat(actualPosition.takeProfit) : null;
    
    console.log(`\n📊 Actual values from exchange:`);
    console.log(`   Quantity: ${actualQuantity}`);
    console.log(`   Entry: ${actualEntryPrice}`);
    console.log(`   Leverage: ${actualLeverage}x`);
    console.log(`   SL: ${actualSlPrice || 'NOT SET'}`);
    console.log(`   TP1: ${actualTp1Price || 'NOT SET'}`);
    
    // Compare with tolerances
    console.log(`\n🔍 Comparing planned vs actual...`);
    
    // Quantity check
    const quantityDiff = Math.abs(actualQuantity - planned.quantity);
    const quantityDiffPercent = quantityDiff / planned.quantity;
    console.log(`   Quantity: planned ${planned.quantity}, actual ${actualQuantity}, diff ${(quantityDiffPercent * 100).toFixed(2)}%`);
    
    if (quantityDiffPercent > QUANTITY_TOLERANCE) {
      discrepancies.push({
        field: 'quantity',
        planned: planned.quantity,
        actual: actualQuantity,
        diff: quantityDiff,
        threshold: QUANTITY_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: ${(quantityDiffPercent * 100).toFixed(2)}% > ${(QUANTITY_TOLERANCE * 100).toFixed(2)}%`);
    } else {
      console.log(`      ✅ OK`);
    }
    
    // Entry price check
    const entryDiff = Math.abs(actualEntryPrice - planned.entryPrice);
    const entryDiffPercent = entryDiff / planned.entryPrice;
    console.log(`   Entry: planned ${planned.entryPrice}, actual ${actualEntryPrice}, diff ${(entryDiffPercent * 100).toFixed(2)}%`);
    
    if (entryDiffPercent > PRICE_TOLERANCE) {
      discrepancies.push({
        field: 'entryPrice',
        planned: planned.entryPrice,
        actual: actualEntryPrice,
        diff: entryDiff,
        threshold: PRICE_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: ${(entryDiffPercent * 100).toFixed(2)}% > ${(PRICE_TOLERANCE * 100).toFixed(2)}%`);
    } else {
      console.log(`      ✅ OK`);
    }
    
    // SL check
    if (planned.slPrice && actualSlPrice) {
      const slDiff = Math.abs(actualSlPrice - planned.slPrice);
      const slDiffPercent = slDiff / planned.slPrice;
      console.log(`   SL: planned ${planned.slPrice.toFixed(4)}, actual ${actualSlPrice.toFixed(4)}, diff ${(slDiffPercent * 100).toFixed(2)}%`);
      
      if (slDiffPercent > PRICE_TOLERANCE) {
        discrepancies.push({
          field: 'slPrice',
          planned: planned.slPrice,
          actual: actualSlPrice,
          diff: slDiff,
          threshold: PRICE_TOLERANCE
        });
        console.log(`      ⚠️ DISCREPANCY`);
      } else {
        console.log(`      ✅ OK`);
      }
    } else if (planned.slPrice && !actualSlPrice) {
      discrepancies.push({
        field: 'slPrice',
        planned: planned.slPrice,
        actual: 'MISSING',
        diff: 0,
        threshold: PRICE_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: SL not found on exchange`);
    }
    
    // TP1 check
    if (planned.tp1Price && actualTp1Price) {
      const tp1Diff = Math.abs(actualTp1Price - planned.tp1Price);
      const tp1DiffPercent = tp1Diff / planned.tp1Price;
      console.log(`   TP1: planned ${planned.tp1Price.toFixed(4)}, actual ${actualTp1Price.toFixed(4)}, diff ${(tp1DiffPercent * 100).toFixed(2)}%`);
      
      if (tp1DiffPercent > PRICE_TOLERANCE) {
        discrepancies.push({
          field: 'tp1Price',
          planned: planned.tp1Price,
          actual: actualTp1Price,
          diff: tp1Diff,
          threshold: PRICE_TOLERANCE
        });
        console.log(`      ⚠️ DISCREPANCY`);
      } else {
        console.log(`      ✅ OK`);
      }
    } else if (planned.tp1Price && !actualTp1Price) {
      discrepancies.push({
        field: 'tp1Price',
        planned: planned.tp1Price,
        actual: 'MISSING',
        diff: 0,
        threshold: PRICE_TOLERANCE
      });
      console.log(`      ⚠️ DISCREPANCY: TP1 not found on exchange`);
    }
    
    // Log to detailed logs
    await db.insert(botDetailedLogs).values({
      positionId,
      alertId,
      actionType: 'open_position',
      stage: 'verification',
      plannedSymbol: planned.symbol,
      plannedSide: planned.side,
      plannedQuantity: planned.quantity,
      plannedEntryPrice: planned.entryPrice,
      plannedSlPrice: planned.slPrice,
      plannedTp1Price: planned.tp1Price,
      plannedTp2Price: planned.tp2Price,
      plannedTp3Price: planned.tp3Price,
      plannedLeverage: planned.leverage,
      actualSymbol: actualPosition.symbol,
      actualSide: actualPosition.side === 'Buy' ? 'BUY' : 'SELL',
      actualQuantity,
      actualEntryPrice,
      actualSlPrice,
      actualTp1Price,
      actualTp2Price: null,
      actualTp3Price: null,
      actualLeverage,
      hasDiscrepancy: discrepancies.length > 0,
      discrepancyDetails: discrepancies.length > 0 ? JSON.stringify(discrepancies) : null,
      discrepancyThreshold: PRICE_TOLERANCE,
      settingsSnapshot: JSON.stringify(botSettings),
      orderId,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    
    const success = discrepancies.length === 0;
    
    console.log(`\n🔍 ========== VERIFICATION ${success ? 'PASSED ✅' : 'FAILED ❌'} ==========`);
    if (!success) {
      console.log(`   Discrepancies found: ${discrepancies.length}`);
    }
    console.log(`${'='.repeat(60)}\n`);
    
    return {
      success,
      discrepancies
    };
    
  } catch (error: any) {
    console.error(`\n❌ Verification failed with error:`, error.message);
    
    await db.insert(botDetailedLogs).values({
      positionId,
      alertId,
      actionType: 'open_position',
      stage: 'verification_error',
      plannedSymbol: planned.symbol,
      plannedSide: planned.side,
      plannedQuantity: planned.quantity,
      plannedEntryPrice: planned.entryPrice,
      plannedSlPrice: planned.slPrice,
      plannedTp1Price: planned.tp1Price,
      plannedTp2Price: planned.tp2Price,
      plannedTp3Price: planned.tp3Price,
      plannedLeverage: planned.leverage,
      actualSymbol: null,
      actualSide: null,
      actualQuantity: null,
      actualEntryPrice: null,
      actualSlPrice: null,
      actualTp1Price: null,
      actualTp2Price: null,
      actualTp3Price: null,
      actualLeverage: null,
      hasDiscrepancy: true,
      discrepancyDetails: JSON.stringify({ error: error.message }),
      discrepancyThreshold: PRICE_TOLERANCE,
      settingsSnapshot: JSON.stringify(botSettings),
      orderId,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    
    return {
      success: false,
      discrepancies: [{
        field: 'verification_error',
        planned: 'N/A',
        actual: error.message,
        diff: 0,
        threshold: 0
      }]
    };
  }
}

// ============================================
// 🌐 GET ENDPOINT (TEST)
// ============================================

export async function GET(request: Request) {
  const timestamp = new Date().toISOString();
  
  await logToBot('info', 'webhook_test', 'Webhook endpoint tested via GET', { timestamp, url: request.url });
  
  return NextResponse.json({ 
    status: 'online',
    message: 'TradingView Webhook Endpoint (BYBIT MAINNET ONLY) is working!',
    timestamp,
    endpoint: '/api/webhook/tradingview',
    exchange: 'BYBIT',
    methods: ['GET (test)', 'POST (receive alerts)']
  });
}

// ============================================
// 📨 POST ENDPOINT (RECEIVE ALERTS)
// ============================================

export async function POST(request: Request) {
  let trackingId: number | null = null;
  
  try {
    // Parse request body
    const rawBody = await request.text();
    console.log("📨 RAW WEBHOOK BODY:", rawBody);
    
    let rawData;
    try {
      rawData = JSON.parse(rawBody);
    } catch (parseError) {
      await logToBot('error', 'parse_error', 'Failed to parse JSON', { error: String(parseError), rawBodyPreview: rawBody.substring(0, 500) });
      return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
    }

    const data = snakeToCamel(rawData);
    console.log("🔄 Normalized alert data:", JSON.stringify(data, null, 2));

    // Validate symbol
    if (!data.symbol || (typeof data.symbol === 'string' && data.symbol.trim() === '')) {
      await logToBot('error', 'validation_failed', 'Symbol is missing or empty', { receivedData: data });
      return NextResponse.json({ 
        error: 'Symbol is required and cannot be empty.',
        receivedData: data
      }, { status: 400 });
    }

    // Normalize symbol (remove .P suffix if present)
    const originalSymbol = data.symbol.trim();
    const normalizedSymbol = originalSymbol.replace(/\.P$/, '');
    data.symbol = normalizedSymbol || originalSymbol;
    
    console.log(`🔧 Symbol: ${originalSymbol} → ${data.symbol}`);

    // Validate other fields
    const requiredFields = ["side", "tier", "entryPrice"];
    for (const field of requiredFields) {
      if (!(field in data) || !data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        await logToBot('error', 'validation_failed', `Missing or empty field: ${field}`, { field, data });
        return NextResponse.json({ 
          error: `Missing or empty required field: ${field}`,
          field,
          receivedData: data
        }, { status: 400 });
      }
    }

    const receivedAt = Date.now();
    const alertTimestamp = data.timestamp || data.tvTs || Math.floor(receivedAt / 1000);
    const latency = Math.max(0, receivedAt - (alertTimestamp * 1000));

    // Check for duplicates
    const duplicateCheck = await db.select()
      .from(alerts)
      .where(and(
        eq(alerts.symbol, data.symbol),
        eq(alerts.side, data.side),
        eq(alerts.tier, data.tier)
      ))
      .limit(10);
    
    const isDuplicate = duplicateCheck.some(alert => Math.abs(alert.timestamp - alertTimestamp) < 5);
    
    if (isDuplicate) {
      console.log("⚠️ Duplicate alert ignored");
      await logToBot('warning', 'duplicate_ignored', `Duplicate: ${data.symbol} ${data.side}`, { symbol: data.symbol, side: data.side });
      return NextResponse.json({ success: true, message: "Duplicate alert ignored", duplicate: true });
    }

    // Save alert
    const [alert] = await db.insert(alerts).values({
      timestamp: alertTimestamp,
      symbol: data.symbol,
      side: data.side,
      tier: data.tier,
      tierNumeric: data.tierNumeric || 3,
      strength: data.strength || 0.5,
      entryPrice: parseFloat(data.entryPrice),
      sl: parseFloat(data.sl || "0"),
      tp1: parseFloat(data.tp1 || "0"),
      tp2: parseFloat(data.tp2 || "0"),
      tp3: parseFloat(data.tp3 || "0"),
      mainTp: parseFloat(data.mainTp || data.tp1 || "0"),
      atr: data.atr || 0,
      volumeRatio: data.volumeRatio || 1,
      session: data.session || "unknown",
      regime: data.regime || "neutral",
      regimeConfidence: data.regimeConfidence || 0.5,
      mtfAgreement: data.mtfAgreement || 0.5,
      leverage: data.leverage || 10,
      inOb: data.inOb || false,
      inFvg: data.inFvg || false,
      obScore: data.obScore || 0,
      fvgScore: data.fvgScore || 0,
      institutionalFlow: data.institutionalFlow || null,
      accumulation: data.accumulation || null,
      volumeClimax: data.volumeClimax || null,
      latency,
      rawJson: JSON.stringify(data),
      executionStatus: 'pending',
      rejectionReason: null,
      errorType: null,
      createdAt: new Date().toISOString(),
    }).returning();

    console.log("✅ Alert saved:", alert.id);
    await logToBot('info', 'alert_received', `Alert received: ${data.symbol} ${data.side} ${data.tier}`, { symbol: data.symbol, side: data.side, tier: data.tier }, alert.id);

    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) {
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'no_bot_settings',
        errorType: 'configuration_missing'
      }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'Bot settings not configured', { reason: 'no_bot_settings' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, bot settings missing" });
    }

    const botConfig = settings[0];

    if (!botConfig.apiKey || !botConfig.apiSecret) {
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'no_api_credentials',
        errorType: 'configuration_missing'
      }).where(eq(alerts.id, alert.id));
      await logToBot('error', 'rejected', 'Bybit API credentials incomplete', { reason: 'no_api_credentials' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Alert saved, Bybit credentials incomplete" });
    }

    console.log(`\n📋 ========== BOT SETTINGS VERIFICATION ==========`);
    console.log(`✅ Using bot settings from DATABASE:`);
    console.log(`   Bot Enabled: ${botConfig.botEnabled}`);
    console.log(`   Exchange: bybit (mainnet)`);
    console.log(`   Position Size: $${botConfig.positionSizeFixed}`);
    console.log(`   Leverage: ${botConfig.leverageFixed}x`);
    console.log(`${'='.repeat(50)}\n`);

    const apiKey = botConfig.apiKey;
    const apiSecret = botConfig.apiSecret;
    const exchange = "bybit";

    console.log(`🔑 Using BYBIT MAINNET - API Key: ${apiKey.substring(0, 8)}...`);

    if (!botConfig.botEnabled) {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'bot_disabled' 
      }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', 'Bot is disabled', { reason: 'bot_disabled' }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: "Bot is disabled" });
    }

    // Check symbol locks
    const lockStatus = await checkSymbolLock(data.symbol);
    if (lockStatus.locked) {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'symbol_locked' 
      }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', `Symbol ${data.symbol} is locked: ${lockStatus.reason}`, { 
        symbol: data.symbol,
        lockReason: lockStatus.reason
      }, alert.id);
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        message: `Symbol ${data.symbol} is locked due to: ${lockStatus.reason}` 
      });
    }

    // Check disabled tiers
    const disabledTiers = JSON.parse(botConfig.disabledTiers || '[]');
    if (disabledTiers.includes(data.tier)) {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'tier_disabled' 
      }).where(eq(alerts.id, alert.id));
      await logToBot('warning', 'rejected', `Tier ${data.tier} disabled`, { tier: data.tier }, alert.id);
      return NextResponse.json({ success: true, alert_id: alert.id, message: `Tier ${data.tier} disabled` });
    }

    // Conflict resolution
    console.log(`\n🔍 Checking for conflicts...`);
    const conflictAnalysis = await resolveConflict(alert, botConfig);
    
    console.log(`   Conflict type: ${conflictAnalysis.conflictType}`);
    console.log(`   Resolution: ${conflictAnalysis.resolution}`);
    console.log(`   Should proceed: ${conflictAnalysis.shouldProceed}`);

    if (conflictAnalysis.hasConflict) {
      await logToBot('info', 'conflict_detected', conflictAnalysis.reason, {
        conflictType: conflictAnalysis.conflictType,
        resolution: conflictAnalysis.resolution,
        existingPositionId: conflictAnalysis.existingPosition?.id
      }, alert.id, conflictAnalysis.existingPosition?.id);
    }

    if (conflictAnalysis.resolution === 'REJECT') {
      await db.update(alerts).set({ 
        executionStatus: 'rejected', 
        rejectionReason: 'conflict_rejected' 
      }).where(eq(alerts.id, alert.id));
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        message: conflictAnalysis.reason,
        conflict: true
      });
    }

    if (conflictAnalysis.resolution === 'UPGRADE' && conflictAnalysis.existingPosition) {
      await db.update(botPositions).set({ 
        confirmationCount: conflictAnalysis.existingPosition.confirmationCount + 1,
        lastUpdated: new Date().toISOString(),
      }).where(eq(botPositions.id, conflictAnalysis.existingPosition.id));
      
      await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));
      
      await logToBot('info', 'confirmation_tracked', `Confirmation tracked for ${data.symbol}`, { 
        count: conflictAnalysis.existingPosition.confirmationCount + 1 
      }, alert.id, conflictAnalysis.existingPosition.id);
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        message: "Confirmation tracked",
        conflict: true,
        resolution: 'upgrade'
      });
    }

    if (conflictAnalysis.resolution === 'CLOSE_AND_OPEN' && conflictAnalysis.existingPosition) {
      console.log(`🔄 Reversing position on ${data.symbol}`);
      
      try {
        // Get current market price before closing
        const currentPrice = await getCurrentMarketPrice(data.symbol, apiKey, apiSecret);
        
        const closeOrderId = await closeBybitPosition(
          data.symbol,
          conflictAnalysis.existingPosition.side,
          apiKey,
          apiSecret
        );

        // Calculate PnL
        const isLong = conflictAnalysis.existingPosition.side === 'BUY';
        const priceDiff = isLong 
          ? (currentPrice - conflictAnalysis.existingPosition.entryPrice) 
          : (conflictAnalysis.existingPosition.entryPrice - currentPrice);
        
        let realizedPnl = priceDiff * conflictAnalysis.existingPosition.quantity;

        // Try to get realized PnL from Bybit
        const pnlData = await getRealizedPnlFromBybit(closeOrderId, data.symbol, apiKey, apiSecret);
        if (pnlData) {
          realizedPnl = pnlData.realizedPnl;
          console.log(`✅ Got realized PnL from Bybit: ${realizedPnl.toFixed(2)} USD`);
        } else {
          console.log(`⚠️ Using estimated PnL: ${realizedPnl.toFixed(2)} USD`);
        }

        const pnlPercent = (realizedPnl / conflictAnalysis.existingPosition.initialMargin) * 100;

        // Calculate duration
        const openedAt = new Date(conflictAnalysis.existingPosition.openedAt);
        const closedAt = new Date();
        const durationMinutes = Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);

        // Update position status in DB
        await db.update(botPositions).set({ 
          status: "closed",
          closeReason: "opposite_direction",
          closedAt: closedAt.toISOString(),
        }).where(eq(botPositions.id, conflictAnalysis.existingPosition.id));

        // ✅ CRITICAL FIX: Save to positionHistory
        await db.insert(positionHistory).values({
          positionId: conflictAnalysis.existingPosition.id,
          symbol: conflictAnalysis.existingPosition.symbol,
          side: conflictAnalysis.existingPosition.side,
          tier: conflictAnalysis.existingPosition.tier,
          entryPrice: conflictAnalysis.existingPosition.entryPrice,
          closePrice: currentPrice,
          quantity: conflictAnalysis.existingPosition.quantity,
          leverage: conflictAnalysis.existingPosition.leverage,
          pnl: realizedPnl,
          pnlPercent,
          closeReason: "opposite_direction",
          tp1Hit: conflictAnalysis.existingPosition.tp1Hit || false,
          tp2Hit: conflictAnalysis.existingPosition.tp2Hit || false,
          tp3Hit: conflictAnalysis.existingPosition.tp3Hit || false,
          confirmationCount: conflictAnalysis.existingPosition.confirmationCount || 1,
          openedAt: conflictAnalysis.existingPosition.openedAt,
          closedAt: closedAt.toISOString(),
          durationMinutes,
        });

        console.log(`✅ Position saved to history: PnL ${realizedPnl.toFixed(2)} USD (${pnlPercent.toFixed(2)}%), Duration: ${durationMinutes}min`);

        await db.insert(botActions).values({
          actionType: "position_closed",
          symbol: data.symbol,
          side: conflictAnalysis.existingPosition.side,
          tier: conflictAnalysis.existingPosition.tier,
          positionId: conflictAnalysis.existingPosition.id,
          reason: "opposite_direction",
          details: JSON.stringify({ closeOrderId, pnl: realizedPnl, pnlPercent, durationMinutes }),
          success: true,
          createdAt: new Date().toISOString(),
        });

        console.log("✅ Opposite position closed, proceeding with new trade");
        await logToBot('success', 'reversal_complete', `Position reversed: ${data.symbol} (PnL: ${realizedPnl.toFixed(2)} USD)`, {
          closedPositionId: conflictAnalysis.existingPosition.id,
          closeOrderId,
          pnl: realizedPnl,
          pnlPercent
        }, alert.id);
        
      } catch (error: any) {
        const errorType = classifyError('', error.message);
        
        await db.update(alerts).set({ 
          executionStatus: 'error_rejected', 
          rejectionReason: 'failed_close_opposite',
          errorType: errorType.type
        }).where(eq(alerts.id, alert.id));
        
        await logToBot('error', 'close_failed', `Failed to close for reversal: ${error.message}`, { 
          error: error.message,
          errorType: errorType.type
        }, alert.id, conflictAnalysis.existingPosition.id);
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: "Failed to close opposite position",
          conflict: true
        });
      }
    }

    // Calculate SL/TP from bot settings
    const entryPrice = parseFloat(data.entryPrice);
    const alertStrength = data.strength || 0.5;
    let slPrice: number | null = null;
    let tp1Price: number | null = null;
    let tp2Price: number | null = null;
    let tp3Price: number | null = null;

    console.log("🎯 Bot uses SL/TP from settings (ignores alert values)");
    
    if (botConfig.useDefaultSlTp) {
      let slRR = botConfig.defaultSlRR || 1.0;
      let tp1RR = botConfig.tp1RR || 1.0;
      let tp2RR = botConfig.tp2RR || 2.0;
      let tp3RR = botConfig.tp3RR || 3.0;
      
      const useAdaptive = botConfig.adaptiveRR && alertStrength >= botConfig.adaptiveStrengthThreshold;
      
      if (useAdaptive) {
        const multiplier = botConfig.adaptiveMultiplier || 1.5;
        const adaptiveFactor = multiplier * alertStrength;
        
        slRR = slRR * (1 / adaptiveFactor);
        tp1RR = tp1RR * adaptiveFactor;
        tp2RR = tp2RR * adaptiveFactor;
        tp3RR = tp3RR * adaptiveFactor;
        
        console.log(`🎯 Adaptive R:R enabled: strength ${alertStrength.toFixed(2)}, factor ${adaptiveFactor.toFixed(2)}`);
      }
      
      const tpCount = botConfig.tpCount || 3;
      
      // Calculate SL
      let positionSizeUsd = botConfig.positionSizeFixed;
      const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;
      
      if (botConfig.slAsMarginPercent) {
        const initialMargin = positionSizeUsd / leverage;
        const maxLossUsd = initialMargin * (botConfig.slMarginRiskPercent / 100);
        
        let marketPriceForCalc: number;
        try {
          marketPriceForCalc = await getCurrentMarketPrice(data.symbol, apiKey, apiSecret);
        } catch (error) {
          marketPriceForCalc = entryPrice;
        }
        
        const coinAmount = positionSizeUsd / marketPriceForCalc;
        const slPriceDistance = maxLossUsd / coinAmount;
        
        if (data.side === "BUY") {
          slPrice = entryPrice - slPriceDistance;
        } else {
          slPrice = entryPrice + slPriceDistance;
        }
      } else {
        if (data.side === "BUY") {
          slPrice = entryPrice * (1 - (slRR / 100));
        } else {
          slPrice = entryPrice * (1 + (slRR / 100));
        }
      }

      // Calculate TPs
      const slDistance = Math.abs(entryPrice - (slPrice || entryPrice));
      
      if (data.side === "BUY") {
        tp1Price = entryPrice + (slDistance * tp1RR);
        if (tpCount >= 2) tp2Price = entryPrice + (slDistance * tp2RR);
        if (tpCount >= 3) tp3Price = entryPrice + (slDistance * tp3RR);
      } else {
        tp1Price = entryPrice - (slDistance * tp1RR);
        if (tpCount >= 2) tp2Price = entryPrice - (slDistance * tp2RR);
        if (tpCount >= 3) tp3Price = entryPrice - (slDistance * tp3RR);
      }

      console.log(`\n🛡️ TP strategy: ${tpCount} TPs, Side: ${data.side}`);
      console.log(`   Entry: ${entryPrice}`);
      console.log(`   SL: ${slPrice?.toFixed(4)}`);
      console.log(`   TP1: ${tp1Price?.toFixed(4)}`);
      if (tpCount >= 2) console.log(`   TP2: ${tp2Price?.toFixed(4)}`);
      if (tpCount >= 3) console.log(`   TP3: ${tp3Price?.toFixed(4)}`);
    } else {
      // Use SL/TP from TradingView alert
      console.log("🎯 Using SL/TP from TradingView alert");
      
      slPrice = data.sl ? parseFloat(data.sl) : null;
      tp1Price = data.tp1 ? parseFloat(data.tp1) : null;
      tp2Price = data.tp2 ? parseFloat(data.tp2) : null;
      tp3Price = data.tp3 ? parseFloat(data.tp3) : null;
      
      // Validate that at least SL and TP1 exist
      if (!slPrice || !tp1Price) {
        await db.update(alerts).set({ 
          executionStatus: 'rejected', 
          rejectionReason: 'no_sl_tp_provided' 
        }).where(eq(alerts.id, alert.id));
        
        await logToBot('error', 'rejected', 'Alert missing required SL/TP values', { 
          reason: 'no_sl_tp_provided',
          hasSL: !!slPrice,
          hasTP1: !!tp1Price
        }, alert.id);
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          message: "Alert rejected: Missing SL or TP1 in TradingView data" 
        });
      }
      
      console.log(`\n🛡️ TradingView SL/TP values:`);
      console.log(`   Entry: ${entryPrice}`);
      console.log(`   SL: ${slPrice?.toFixed(4)}`);
      console.log(`   TP1: ${tp1Price?.toFixed(4)}`);
      if (tp2Price) console.log(`   TP2: ${tp2Price?.toFixed(4)}`);
      if (tp3Price) console.log(`   TP3: ${tp3Price?.toFixed(4)}`);
    }

    // Calculate position size
    let positionSizeUsd = botConfig.positionSizeFixed;
    const leverage = botConfig.leverageMode === "from_alert" ? (data.leverage || botConfig.leverageFixed) : botConfig.leverageFixed;

    console.log(`💰 Position: $${positionSizeUsd}, Leverage: ${leverage}x`);

    // Open position on Bybit
    try {
      const symbol = data.symbol;
      const side = data.side;

      console.log(`\n🔒 Locking symbol ${symbol} ${side} for opening...`);
      trackingId = await lockSymbolForOpening(symbol, side);
      console.log(`✅ Symbol locked with tracking ID: ${trackingId}`);

      await logToBot('info', 'opening_position', `Opening ${symbol} ${side} ${leverage}x on Bybit`, { 
        symbol, 
        side, 
        leverage, 
        positionSizeUsd,
        trackingId
      }, alert.id);

      // ✅ NEW: Dynamic position size validation and adjustment per-symbol
      console.log(`\n💰 ========== DYNAMIC POSITION SIZING ==========`);
      console.log(`   Target Position Size: $${positionSizeUsd}`);
      console.log(`   Leverage: ${leverage}x`);
      console.log(`   Fetching symbol requirements for ${symbol}...`);
      
      let marketPrice: number;
      let adjustedQuantity: number;
      let actualPositionSize: number;
      let adjustmentReason: string;
      
      try {
        // Get current market price
        marketPrice = await getCurrentMarketPrice(symbol, apiKey, apiSecret);
        console.log(`   Current Market Price: ${marketPrice}`);
        
        // Validate and auto-adjust position size based on symbol minimums
        const validation = await validateAndAdjustPositionSize(
          symbol,
          positionSizeUsd,
          marketPrice,
          leverage,
          apiKey,
          apiSecret
        );
        
        adjustedQuantity = validation.adjustedQuantity;
        actualPositionSize = validation.adjustedPositionSize;
        adjustmentReason = validation.reason;
        
        // Log symbol info
        console.log(`\n📋 Symbol Requirements (${symbol}):`);
        console.log(`   Min Quantity: ${validation.symbolInfo.minOrderQty}`);
        console.log(`   Qty Step: ${validation.symbolInfo.qtyStep}`);
        console.log(`   Precision: ${validation.symbolInfo.precision} decimals`);
        console.log(`   Min Notional: $${validation.symbolInfo.minNotional}`);
        
        // Log adjustment details
        if (actualPositionSize !== positionSizeUsd) {
          console.log(`\n⚠️ AUTO-ADJUSTMENT APPLIED:`);
          console.log(`   Original: $${positionSizeUsd} → ${(positionSizeUsd / marketPrice).toFixed(6)} ${symbol}`);
          console.log(`   Adjusted: $${actualPositionSize.toFixed(2)} → ${adjustedQuantity} ${symbol}`);
          console.log(`   Reason: ${adjustmentReason}`);
          console.log(`   Min Margin Required: $${(validation.symbolInfo.minOrderQty * marketPrice / leverage).toFixed(2)}`);
          
          await logToBot('warning', 'position_size_adjusted', adjustmentReason, {
            symbol,
            originalSize: positionSizeUsd,
            adjustedSize: actualPositionSize,
            originalQuantity: positionSizeUsd / marketPrice,
            adjustedQuantity,
            minRequired: validation.symbolInfo.minOrderQty,
            leverage
          }, alert.id);
        } else {
          console.log(`\n✅ Position size sufficient for ${symbol}`);
          console.log(`   Quantity: ${adjustedQuantity} ${symbol}`);
        }
        
        // Update positionSizeUsd to actual value being used
        positionSizeUsd = actualPositionSize;
        
      } catch (symbolError: any) {
        console.error(`❌ Symbol validation failed:`, symbolError.message);
        
        if (trackingId) {
          await markPositionOpenFailed(trackingId);
        }
        
        await db.update(alerts).set({ 
          executionStatus: 'error_rejected', 
          rejectionReason: 'symbol_validation_failed',
          errorType: 'configuration_error'
        }).where(eq(alerts.id, alert.id));
        
        await logToBot('error', 'symbol_validation_failed', `Failed to validate ${symbol}: ${symbolError.message}`, {
          error: symbolError.message
        }, alert.id);
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: `Symbol validation failed: ${symbolError.message}`,
          message: "Alert saved but symbol validation failed" 
        });
      }
      
      console.log(`${'='.repeat(50)}\n`);

      let orderId: string;
      
      try {
        const result = await openBybitPosition(
          symbol,
          side,
          adjustedQuantity,
          leverage,
          apiKey,
          apiSecret,
          tp1Price || undefined,
          slPrice || undefined
        );
        
        orderId = result.orderId;
      } catch (openError: any) {
        const errorType = classifyError(openError.code || '', openError.message);
        
        console.error(`❌ Position opening failed (${errorType.type}):`, openError.message);
        
        if (trackingId) {
          await markPositionOpenFailed(trackingId);
        }
        
        await db.update(alerts).set({ 
          executionStatus: 'error_rejected', 
          rejectionReason: 'exchange_error',
          errorType: errorType.type
        }).where(eq(alerts.id, alert.id));

        await db.insert(botActions).values({
          actionType: "position_failed",
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          alertId: alert.id,
          reason: "exchange_error",
          details: JSON.stringify({ 
            error: openError.message, 
            exchange: "bybit",
            errorType: errorType.type
          }),
          success: false,
          errorMessage: openError.message,
          createdAt: new Date().toISOString(),
        });

        await logToBot('error', 'position_failed', `Position opening failed: ${openError.message}`, { 
          error: openError.message,
          errorType: errorType.type
        }, alert.id);

        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: openError.message, 
          errorType: errorType.type,
          message: "Alert saved but position opening failed" 
        });
      }

      // Save to database
      try {
        const [botPosition] = await db.insert(botPositions).values({
          symbol: data.symbol,
          side: data.side,
          entryPrice,
          quantity: adjustedQuantity,
          leverage,
          stopLoss: slPrice || 0,
          tp1Price,
          tp2Price,
          tp3Price,
          mainTpPrice: tp1Price || 0,
          tier: data.tier,
          confidenceScore: data.strength || 0.5,
          confirmationCount: 1,
          tp1Hit: false,
          tp2Hit: false,
          tp3Hit: false,
          currentSl: slPrice || 0,
          positionValue: positionSizeUsd,
          initialMargin: positionSizeUsd / leverage,
          unrealisedPnl: 0,
          status: "open",
          alertId: alert.id,
          bybitOrderId: orderId,
          openedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        }).returning();

        if (trackingId) {
          await markPositionOpened(trackingId, botPosition.id);
        }

        await db.update(alerts).set({ executionStatus: 'executed' }).where(eq(alerts.id, alert.id));

        await db.insert(botActions).values({
          actionType: "position_opened",
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          alertId: alert.id,
          positionId: botPosition.id,
          reason: "new_signal",
          details: JSON.stringify({ 
            orderId, 
            exchange: "bybit",
            tpLevels: botConfig.tpCount,
            tp1Price,
            tp2Price,
            tp3Price
          }),
          success: true,
          createdAt: new Date().toISOString(),
        });

        await logToBot('success', 'position_opened', `Position opened: ${symbol} ${side} ${leverage}x`, {
          positionId: botPosition.id,
          orderId,
          symbol,
          side,
          leverage,
          quantity: adjustedQuantity,
          entryPrice,
          sl: slPrice,
          tp1: tp1Price
        }, alert.id, botPosition.id);

        // Verify position
        console.log(`\n🔍 Running position verification...`);
        try {
          const verificationResult = await verifyPositionOpening(
            botPosition.id,
            {
              symbol,
              side: data.side,
              quantity: adjustedQuantity,
              entryPrice,
              slPrice,
              tp1Price,
              tp2Price,
              tp3Price,
              leverage
            },
            orderId,
            apiKey,
            apiSecret,
            alert.id,
            botConfig
          );

          if (!verificationResult.success) {
            console.error(`🚨 Position verification FAILED!`);
            
            // Check if only SL/TP missing
            const slTpMissing = verificationResult.discrepancies.filter(d => 
              (d.field === 'slPrice' || d.field === 'tp1Price') && d.actual === 'MISSING'
            );
            
            const otherIssues = verificationResult.discrepancies.filter(d => 
              d.field !== 'slPrice' && d.field !== 'tp1Price'
            );
            
            const onlyMinorEntryDiff = otherIssues.every(d => 
              d.field === 'entryPrice' && (d.diff as number / entryPrice) < 0.025
            );
            
            const onlySlTpMissing = slTpMissing.length > 0 && (otherIssues.length === 0 || onlyMinorEntryDiff);
            
            if (onlySlTpMissing) {
              console.log(`   ⚠️ Only SL/TP missing - allowing position (monitor will fix)`);
              
              await db.insert(diagnosticFailures).values({
                positionId: botPosition.id,
                failureType: 'sl_tp_delayed',
                reason: `SL/TP not found: ${slTpMissing.map(d => d.field).join(', ')}`,
                attemptCount: 1,
                errorDetails: JSON.stringify(verificationResult.discrepancies),
                createdAt: new Date().toISOString()
              });
            } else {
              console.log(`   🚨 CRITICAL: Quantity/entry issues - closing position`);
              
              await db.insert(diagnosticFailures).values({
                positionId: botPosition.id,
                failureType: 'verification_failed',
                reason: `Discrepancies: ${verificationResult.discrepancies.map(d => d.field).join(', ')}`,
                attemptCount: 1,
                errorDetails: JSON.stringify(verificationResult.discrepancies),
                createdAt: new Date().toISOString()
              });
              
              // Lock symbol
              await db.insert(symbolLocks).values({
                symbol: data.symbol,
                lockReason: 'verification_failure',
                lockedAt: new Date().toISOString(),
                failureCount: 1,
                lastError: `Discrepancies: ${verificationResult.discrepancies.map(d => d.field).join(', ')}`,
                unlockedAt: null,
                isPermanent: false,
                createdAt: new Date().toISOString()
              });
              
              // Close position
              try {
                await closeBybitPosition(symbol, side, apiKey, apiSecret);
                
                await db.update(botPositions).set({
                  status: 'closed',
                  closeReason: 'emergency_verification_failure',
                  closedAt: new Date().toISOString()
                }).where(eq(botPositions.id, botPosition.id));
              } catch (closeErr) {
                console.error(`Failed to close:`, closeErr);
              }
              
              return NextResponse.json({
                success: false,
                alert_id: alert.id,
                position_id: botPosition.id,
                error: 'Position verification failed',
                discrepancies: verificationResult.discrepancies,
                symbolLocked: true
              });
            }
          }
        } catch (verifyError: any) {
          console.error(`⚠️ Verification error:`, verifyError.message);
        }

        // Run monitor
        console.log("\n🔍 Running position monitor...");
        try {
          const monitorResult = await monitorAndManagePositions(false);
          if (monitorResult.success) {
            console.log(`✅ Monitor completed`);
          }
        } catch (error) {
          console.error("❌ Monitor failed:", error);
        }

        return NextResponse.json({
          success: true,
          alert_id: alert.id,
          position_id: botPosition.id,
          message: `Position opened`,
          exchange: "bybit",
          position: { 
            symbol, 
            side, 
            entry: entryPrice, 
            quantity: adjustedQuantity, 
            sl: slPrice, 
            tp1: tp1Price
          },
          monitorRan: true
        });
        
      } catch (dbError: any) {
        console.error(`🔴 CRITICAL: DB save failed!`, dbError.message);
        
        if (trackingId) {
          await markPositionOpenFailed(trackingId);
        }
        
        await logToBot('error', 'critical_db_failure', `Position opened but DB save failed`, {
          orderId,
          dbError: dbError.message
        }, alert.id);
        
        // Emergency close
        try {
          await closeBybitPosition(symbol, side, apiKey, apiSecret);
        } catch (closeError) {
          console.error(`Failed to emergency close:`, closeError);
        }
        
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id, 
          error: 'DB save failed - emergency close attempted',
          critical: true
        });
      }

    } catch (error: any) {
      if (trackingId) {
        await markPositionOpenFailed(trackingId);
      }
      
      console.error("❌ Unexpected error:", error);
      
      await db.update(alerts).set({ 
        executionStatus: 'error_rejected', 
        rejectionReason: 'unexpected_error',
        errorType: 'unknown'
      }).where(eq(alerts.id, alert.id));
      
      await logToBot('error', 'unexpected_error', `Unexpected error: ${error.message}`, { 
        error: error.message
      }, alert.id);
      
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id, 
        error: error.message, 
        message: "Alert saved but unexpected error occurred" 
      });
    }
  } catch (error: any) {
    if (trackingId) {
      try {
        await markPositionOpenFailed(trackingId);
      } catch (cleanupError) {
        console.error("Failed to cleanup tracking:", cleanupError);
      }
    }
    
    console.error("❌ Webhook error:", error);
    await logToBot('error', 'webhook_error', `Critical error: ${error.message}`, { error: error.message });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}