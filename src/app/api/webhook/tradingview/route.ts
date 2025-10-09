import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    // Store the raw JSON for the database
    const rawJson = JSON.stringify(requestBody);
    
    // Extract timestamp from multiple possible locations
    let timestamp = requestBody.timestamp || requestBody.tv_ts || requestBody.diagnostics?.timestamp;
    
    // If timestamp is in milliseconds (>10000000000), convert to seconds
    if (timestamp && timestamp > 10000000000) {
      timestamp = Math.floor(timestamp / 1000);
    }
    
    // Extract and validate required fields
    const {
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

    // Validate timestamp first
    if (!timestamp || typeof timestamp !== 'number' || isNaN(timestamp)) {
      return NextResponse.json({
        error: "Required field 'timestamp' is missing or invalid",
        code: "MISSING_REQUIRED_FIELD"
      }, { status: 400 });
    }

    // Validate required fields
    const requiredFields = [
      'symbol', 'side', 'tier', 'tier_numeric', 'strength',
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

    // Calculate latency
    const currentTime = Math.floor(Date.now() / 1000);
    const latency = currentTime - timestamp;

    // Prepare alert data
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

    const savedAlert = newAlert[0];

    // ==================== BOT LOGIC START ====================
    
    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    
    if (!settings.length) {
      return NextResponse.json({
        message: "Alert saved, but bot settings not configured",
        alert: savedAlert,
        bot_action: "skipped"
      }, { status: 201 });
    }

    const botConfig = settings[0];

    // Check if bot is enabled
    if (!botConfig.botEnabled) {
      await db.insert(botActions).values({
        actionType: 'alert_ignored',
        symbol: alertData.symbol,
        side: alertData.side,
        tier: alertData.tier,
        alertId: savedAlert.id,
        reason: 'Bot disabled',
        details: 'Bot is currently disabled in settings',
        success: true,
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        message: "Alert saved, but bot is disabled",
        alert: savedAlert,
        bot_action: "ignored_bot_disabled"
      }, { status: 201 });
    }

    // Check tier filtering
    const disabledTiers = JSON.parse(botConfig.disabledTiers);
    if (botConfig.tierFilteringMode === 'custom' && disabledTiers.includes(alertData.tier)) {
      await db.insert(botActions).values({
        actionType: 'alert_ignored',
        symbol: alertData.symbol,
        side: alertData.side,
        tier: alertData.tier,
        alertId: savedAlert.id,
        reason: 'Tier filtered',
        details: `Tier ${alertData.tier} is disabled in settings`,
        success: true,
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        message: "Alert saved, but tier is filtered",
        alert: savedAlert,
        bot_action: "ignored_tier_filtered"
      }, { status: 201 });
    }

    // Check for existing position on same symbol
    const existingPositions = await db.select()
      .from(botPositions)
      .where(and(
        eq(botPositions.symbol, alertData.symbol),
        eq(botPositions.status, 'open')
      ));

    if (existingPositions.length > 0) {
      const existingPosition = existingPositions[0];
      
      // Same direction as existing position
      if (existingPosition.side === alertData.side) {
        if (botConfig.sameSymbolBehavior === 'ignore') {
          await db.insert(botActions).values({
            actionType: 'alert_ignored',
            symbol: alertData.symbol,
            side: alertData.side,
            tier: alertData.tier,
            alertId: savedAlert.id,
            positionId: existingPosition.id,
            reason: 'Same symbol position exists',
            details: `Already have ${existingPosition.side} position on ${alertData.symbol}`,
            success: true,
            createdAt: new Date().toISOString()
          });

          return NextResponse.json({
            message: "Alert saved, but position already exists",
            alert: savedAlert,
            bot_action: "ignored_same_symbol"
          }, { status: 201 });
        }

        if (botConfig.sameSymbolBehavior === 'track_confirmations') {
          // Increment confirmation count
          await db.update(botPositions)
            .set({ 
              confirmationCount: existingPosition.confirmationCount + 1,
              lastUpdated: new Date().toISOString()
            })
            .where(eq(botPositions.id, existingPosition.id));

          await db.insert(botActions).values({
            actionType: 'confirmation_tracked',
            symbol: alertData.symbol,
            side: alertData.side,
            tier: alertData.tier,
            alertId: savedAlert.id,
            positionId: existingPosition.id,
            reason: 'Same direction signal',
            details: `Confirmation count: ${existingPosition.confirmationCount + 1}`,
            success: true,
            createdAt: new Date().toISOString()
          });

          return NextResponse.json({
            message: "Alert saved and confirmation tracked",
            alert: savedAlert,
            bot_action: "confirmation_tracked"
          }, { status: 201 });
        }

        if (botConfig.sameSymbolBehavior === 'upgrade_tp') {
          // Check if new tier is higher
          const existingTierNumeric = getTierNumeric(existingPosition.tier);
          if (alertData.tierNumeric > existingTierNumeric) {
            // Upgrade TP logic - will implement in modify-tpsl API
            await db.insert(botActions).values({
              actionType: 'tp_upgrade_pending',
              symbol: alertData.symbol,
              side: alertData.side,
              tier: alertData.tier,
              alertId: savedAlert.id,
              positionId: existingPosition.id,
              reason: 'Higher tier alert received',
              details: `Upgrade from ${existingPosition.tier} to ${alertData.tier}`,
              success: true,
              createdAt: new Date().toISOString()
            });

            return NextResponse.json({
              message: "Alert saved, TP upgrade pending",
              alert: savedAlert,
              bot_action: "tp_upgrade_pending"
            }, { status: 201 });
          }
        }

        if (botConfig.sameSymbolBehavior === 'emergency_override' && alertData.tier === 'Emergency') {
          // Check emergency override conditions
          const canOverride = checkEmergencyOverride(existingPosition, botConfig);
          
          if (!canOverride.allowed) {
            await db.insert(botActions).values({
              actionType: 'emergency_override_denied',
              symbol: alertData.symbol,
              side: alertData.side,
              tier: alertData.tier,
              alertId: savedAlert.id,
              positionId: existingPosition.id,
              reason: 'Emergency override conditions not met',
              details: canOverride.reason,
              success: true,
              createdAt: new Date().toISOString()
            });

            return NextResponse.json({
              message: "Emergency override denied",
              alert: savedAlert,
              bot_action: "emergency_override_denied"
            }, { status: 201 });
          }

          // Close existing position and open new one
          // This will be handled by position management logic
        }
      } else {
        // Opposite direction
        const strategy = botConfig.oppositeDirectionStrategy;
        
        if (strategy === 'ignore_opposite') {
          await db.insert(botActions).values({
            actionType: 'alert_ignored',
            symbol: alertData.symbol,
            side: alertData.side,
            tier: alertData.tier,
            alertId: savedAlert.id,
            positionId: existingPosition.id,
            reason: 'Opposite direction ignored',
            details: `Have ${existingPosition.side}, received ${alertData.side}`,
            success: true,
            createdAt: new Date().toISOString()
          });

          return NextResponse.json({
            message: "Opposite direction signal ignored",
            alert: savedAlert,
            bot_action: "ignored_opposite_direction"
          }, { status: 201 });
        }

        if (strategy === 'tier_based') {
          const existingTierNumeric = getTierNumeric(existingPosition.tier);
          if (alertData.tierNumeric <= existingTierNumeric) {
            await db.insert(botActions).values({
              actionType: 'alert_ignored',
              symbol: alertData.symbol,
              side: alertData.side,
              tier: alertData.tier,
              alertId: savedAlert.id,
              positionId: existingPosition.id,
              reason: 'Tier not strong enough',
              details: `Existing: ${existingPosition.tier}, New: ${alertData.tier}`,
              success: true,
              createdAt: new Date().toISOString()
            });

            return NextResponse.json({
              message: "Opposite signal not strong enough",
              alert: savedAlert,
              bot_action: "ignored_weak_tier"
            }, { status: 201 });
          }
        }

        // For market_reversal, defensive_close, immediate_reverse - will be handled below
      }
    }

    // Check max concurrent positions
    const activePositions = await db.select()
      .from(botPositions)
      .where(eq(botPositions.status, 'open'));

    if (activePositions.length >= botConfig.maxConcurrentPositions) {
      await db.insert(botActions).values({
        actionType: 'alert_ignored',
        symbol: alertData.symbol,
        side: alertData.side,
        tier: alertData.tier,
        alertId: savedAlert.id,
        reason: 'Max positions reached',
        details: `Already have ${activePositions.length} open positions`,
        success: true,
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        message: "Max concurrent positions reached",
        alert: savedAlert,
        bot_action: "ignored_max_positions"
      }, { status: 201 });
    }

    // Calculate position size
    let positionSizeUSDT = 0;
    if (botConfig.positionSizeMode === 'percent') {
      // Get balance from exchange (will need credentials from env)
      // For now, use fixed amount
      positionSizeUSDT = botConfig.positionSizeFixed;
    } else {
      positionSizeUSDT = botConfig.positionSizeFixed;
    }

    // Calculate leverage
    const finalLeverage = botConfig.leverageMode === 'from_alert' 
      ? alertData.leverage 
      : botConfig.leverageFixed;

    // Calculate quantity based on entry price
    const quantity = positionSizeUSDT / entry_price;

    // Prepare exchange API request
    const exchangePayload = {
      exchange: 'bybit',
      apiKey: process.env.BYBIT_API_KEY,
      apiSecret: process.env.BYBIT_API_SECRET,
      environment: process.env.BYBIT_ENVIRONMENT || 'demo',
      symbol: alertData.symbol,
      side: alertData.side === 'BUY' ? 'Buy' : 'Sell',
      quantity: quantity.toFixed(4),
      leverage: finalLeverage,
      stopLoss: alertData.sl.toString(),
      takeProfit: botConfig.tpStrategy === 'multiple' ? undefined : alertData.mainTp.toString(),
      tp1: botConfig.tpStrategy === 'multiple' ? alertData.tp1.toString() : undefined,
      tp2: botConfig.tpStrategy === 'multiple' ? alertData.tp2.toString() : undefined,
      tp3: botConfig.tpStrategy === 'multiple' ? alertData.tp3.toString() : undefined,
      tpMode: botConfig.tpStrategy
    };

    // Check if exchange credentials are configured
    if (!exchangePayload.apiKey || !exchangePayload.apiSecret) {
      await db.insert(botActions).values({
        actionType: 'position_open_failed',
        symbol: alertData.symbol,
        side: alertData.side,
        tier: alertData.tier,
        alertId: savedAlert.id,
        reason: 'Exchange credentials not configured',
        details: 'BYBIT_API_KEY or BYBIT_API_SECRET not found in environment variables',
        success: false,
        errorMessage: 'Missing exchange credentials',
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        message: "Alert saved, but exchange credentials not configured",
        alert: savedAlert,
        bot_action: "failed_no_credentials"
      }, { status: 201 });
    }

    // Open position via exchange API
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/exchange/open-position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exchangePayload)
      });

      const result = await response.json();

      if (result.success) {
        // Save position to database
        const newPosition = await db.insert(botPositions).values({
          alertId: savedAlert.id,
          symbol: alertData.symbol,
          side: alertData.side,
          tier: alertData.tier,
          entryPrice: entry_price,
          quantity,
          leverage: finalLeverage,
          stopLoss: alertData.sl,
          tp1Price: botConfig.tpStrategy === 'multiple' ? alertData.tp1 : null,
          tp2Price: botConfig.tpStrategy === 'multiple' ? alertData.tp2 : null,
          tp3Price: botConfig.tpStrategy === 'multiple' ? alertData.tp3 : null,
          mainTpPrice: alertData.mainTp,
          currentSl: alertData.sl,
          positionValue: positionSizeUSDT * finalLeverage,
          initialMargin: positionSizeUSDT,
          confirmationCount: 1,
          confidenceScore: strength,
          openedAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          bybitOrderId: result.orderId || null,
          status: 'open'
        }).returning();

        // Log action
        await db.insert(botActions).values({
          actionType: 'position_opened',
          symbol: alertData.symbol,
          side: alertData.side,
          tier: alertData.tier,
          alertId: savedAlert.id,
          positionId: newPosition[0].id,
          reason: 'New signal',
          details: JSON.stringify({
            quantity,
            leverage: finalLeverage,
            positionSize: positionSizeUSDT
          }),
          success: true,
          createdAt: new Date().toISOString()
        });

        return NextResponse.json({
          message: "Alert saved and position opened successfully",
          alert: savedAlert,
          position: newPosition[0],
          bot_action: "position_opened"
        }, { status: 201 });
      } else {
        // Position open failed
        await db.insert(botActions).values({
          actionType: 'position_open_failed',
          symbol: alertData.symbol,
          side: alertData.side,
          tier: alertData.tier,
          alertId: savedAlert.id,
          reason: 'Exchange API error',
          details: result.message || 'Unknown error',
          success: false,
          errorMessage: result.message,
          createdAt: new Date().toISOString()
        });

        return NextResponse.json({
          message: "Alert saved, but position open failed",
          alert: savedAlert,
          error: result.message,
          bot_action: "failed_exchange_error"
        }, { status: 201 });
      }
    } catch (error) {
      await db.insert(botActions).values({
        actionType: 'position_open_failed',
        symbol: alertData.symbol,
        side: alertData.side,
        tier: alertData.tier,
        alertId: savedAlert.id,
        reason: 'API request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        createdAt: new Date().toISOString()
      });

      return NextResponse.json({
        message: "Alert saved, but position open failed",
        alert: savedAlert,
        error: error instanceof Error ? error.message : 'Unknown error',
        bot_action: "failed_api_error"
      }, { status: 201 });
    }

  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + error,
      code: "INTERNAL_SERVER_ERROR"
    }, { status: 500 });
  }
}

// Helper functions
function getTierNumeric(tier: string): number {
  const tierMap: Record<string, number> = {
    'Platinum': 5,
    'Premium': 4,
    'Standard': 3,
    'Quick': 2,
    'Emergency': 1
  };
  return tierMap[tier] || 0;
}

function checkEmergencyOverride(existingPosition: any, config: any): { allowed: boolean; reason: string } {
  if (config.emergencyOverrideMode === 'never') {
    return { allowed: false, reason: 'Emergency override disabled' };
  }

  if (config.emergencyOverrideMode === 'always') {
    return { allowed: true, reason: 'Always override enabled' };
  }

  // Calculate current profit
  const pnlPercent = (existingPosition.unrealisedPnl / existingPosition.initialMargin) * 100;

  if (config.emergencyOverrideMode === 'only_profit' && pnlPercent <= 0) {
    return { allowed: false, reason: `Position in loss (${pnlPercent.toFixed(2)}%)` };
  }

  if (config.emergencyOverrideMode === 'profit_above_x' && pnlPercent < config.emergencyMinProfitPercent) {
    return { allowed: false, reason: `Profit ${pnlPercent.toFixed(2)}% below minimum ${config.emergencyMinProfitPercent}%` };
  }

  return { allowed: true, reason: 'Override conditions met' };
}