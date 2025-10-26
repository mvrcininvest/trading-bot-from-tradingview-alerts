import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts, botSettings, botPositions, botActions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    console.log("📨 Received TradingView alert:", JSON.stringify(data, null, 2));

    // Validate basic required fields
    const requiredFields = [
      "symbol",
      "side",
      "tier",
      "entryPrice",
    ];

    // Check basic required fields
    for (const field of requiredFields) {
      if (!(field in data)) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Save alert to database
    const [alert] = await db.insert(alerts).values({
      timestamp: data.timestamp || Date.now(),
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
      latency: data.latency || 0,
      rawJson: JSON.stringify(data),
      createdAt: new Date().toISOString(),
    }).returning();

    console.log("✅ Alert saved to database:", alert.id);

    // ============================================
    // 🤖 BOT LOGIC - Automatic Trading
    // ============================================

    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) {
      console.log("⚠️ No bot settings found, skipping trade");
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "Alert saved, but bot settings not configured"
      });
    }

    const botConfig = settings[0];

    // Check if bot is enabled
    if (!botConfig.botEnabled) {
      console.log("🛑 Bot is disabled");
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "Alert saved, but bot is disabled"
      });
    }

    // Tier filtering
    const disabledTiers = JSON.parse(botConfig.disabledTiers || '[]');
    if (disabledTiers.includes(data.tier)) {
      console.log(`⚠️ Alert tier ${data.tier} is disabled`);
      await db.insert(botActions).values({
        actionType: "alert_filtered",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "tier_disabled",
        details: JSON.stringify({ tier: data.tier }),
        success: false,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: `Alert tier ${data.tier} is disabled`
      });
    }

    // Check for existing positions on same symbol
    const existingPositions = await db
      .select()
      .from(botPositions)
      .where(
        and(
          eq(botPositions.symbol, data.symbol),
          eq(botPositions.status, "open")
        )
      );

    // Same Symbol Logic
    if (existingPositions.length > 0) {
      const existingPosition = existingPositions[0];
      
      if (botConfig.sameSymbolBehavior === "ignore") {
        console.log(`⚠️ Position already exists on ${data.symbol}, ignoring`);
        await db.insert(botActions).values({
          actionType: "alert_ignored",
          symbol: data.symbol,
          side: data.side,
          tier: data.tier,
          alertId: alert.id,
          reason: "same_symbol_ignore",
          details: JSON.stringify({ reason: "same_symbol_ignore" }),
          success: false,
          createdAt: new Date().toISOString(),
        });
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id,
          message: "Same symbol position exists, ignoring alert"
        });
      }

      // Check if opposite direction
      const isOpposite = 
        (existingPosition.side === "BUY" && data.side === "SELL") ||
        (existingPosition.side === "SELL" && data.side === "BUY");

      if (isOpposite) {
        if (botConfig.oppositeDirectionStrategy === "market_reversal") {
          console.log(`🔄 Closing opposite position and reversing on ${data.symbol}`);
          
          // Close existing position
          try {
            const closeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/exchange/close-position`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: data.symbol,
                side: existingPosition.side,
              }),
            });

            if (!closeResponse.ok) {
              throw new Error("Failed to close position");
            }

            // Update database
            await db
              .update(botPositions)
              .set({ 
                status: "closed",
                closeReason: "opposite_signal",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, existingPosition.id));

            await db.insert(botActions).values({
              actionType: "position_closed",
              symbol: data.symbol,
              side: existingPosition.side,
              tier: existingPosition.tier,
              positionId: existingPosition.id,
              reason: "opposite_signal",
              details: JSON.stringify({ reason: "opposite_signal" }),
              success: true,
              createdAt: new Date().toISOString(),
            });

            console.log("✅ Opposite position closed, proceeding with new trade");
          } catch (error) {
            console.error("❌ Failed to close opposite position:", error);
            return NextResponse.json({ 
              success: false, 
              alert_id: alert.id,
              error: "Failed to close opposite position"
            }, { status: 500 });
          }
        } else {
          console.log(`⚠️ Opposite direction signal on ${data.symbol}, ignoring`);
          await db.insert(botActions).values({
            actionType: "alert_ignored",
            symbol: data.symbol,
            side: data.side,
            tier: data.tier,
            alertId: alert.id,
            reason: "opposite_direction_ignore",
            details: JSON.stringify({ reason: "opposite_direction_ignore" }),
            success: false,
            createdAt: new Date().toISOString(),
          });
          return NextResponse.json({ 
            success: true, 
            alert_id: alert.id,
            message: "Opposite direction signal, ignoring alert"
          });
        }
      } else {
        // Same direction - track confirmations
        if (botConfig.sameSymbolBehavior === "track_confirmations") {
          console.log(`➕ Tracking confirmation for ${data.symbol}`);
          await db
            .update(botPositions)
            .set({ 
              confirmationCount: existingPosition.confirmationCount + 1,
              lastUpdated: new Date().toISOString(),
            })
            .where(eq(botPositions.id, existingPosition.id));
          
          return NextResponse.json({ 
            success: true, 
            alert_id: alert.id,
            message: "Confirmation tracked"
          });
        }
      }
    }

    // ============================================
    // 🎯 CALCULATE SL/TP VALUES
    // ============================================
    
    const entryPrice = parseFloat(data.entryPrice);
    let slPrice: number | null = null;
    let tp1Price: number | null = null;
    let tp2Price: number | null = null;
    let tp3Price: number | null = null;

    // Check if alert contains SL/TP values
    const hasSlTpInAlert = data.sl && data.tp1;

    if (hasSlTpInAlert) {
      // Use values from alert (priority)
      console.log("✅ Using SL/TP from alert");
      slPrice = parseFloat(data.sl);
      tp1Price = parseFloat(data.tp1);
      tp2Price = data.tp2 ? parseFloat(data.tp2) : null;
      tp3Price = data.tp3 ? parseFloat(data.tp3) : null;
    } else if (botConfig.useDefaultSlTp) {
      // Calculate default SL/TP based on entry price
      console.log("🛡️ Using default SL/TP from settings");
      
      const slPercent = botConfig.defaultSlPercent / 100;
      const tp1Percent = botConfig.defaultTp1Percent / 100;
      const tp2Percent = botConfig.defaultTp2Percent / 100;
      const tp3Percent = botConfig.defaultTp3Percent / 100;

      if (data.side === "BUY") {
        slPrice = entryPrice * (1 - slPercent);
        tp1Price = entryPrice * (1 + tp1Percent);
        tp2Price = entryPrice * (1 + tp2Percent);
        tp3Price = entryPrice * (1 + tp3Percent);
      } else {
        slPrice = entryPrice * (1 + slPercent);
        tp1Price = entryPrice * (1 - tp1Percent);
        tp2Price = entryPrice * (1 - tp2Percent);
        tp3Price = entryPrice * (1 - tp3Percent);
      }

      console.log(`📊 Calculated SL/TP: SL=${slPrice}, TP1=${tp1Price}, TP2=${tp2Price}, TP3=${tp3Price}`);
    } else {
      // No SL/TP in alert and default SL/TP not enabled
      console.log("❌ No SL/TP provided and default SL/TP not enabled");
      await db.insert(botActions).values({
        actionType: "alert_ignored",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "no_sl_tp_provided",
        details: JSON.stringify({ reason: "no_sl_tp_provided" }),
        success: false,
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ 
        success: false, 
        alert_id: alert.id,
        error: "No SL/TP provided and default SL/TP not enabled"
      }, { status: 400 });
    }

    // ============================================
    // 💰 CALCULATE POSITION SIZE
    // ============================================

    let positionSizeUsd = botConfig.positionSizeFixed;

    if (botConfig.positionSizeMode === "percent") {
      // Get account balance and calculate percentage
      // For now, use fixed size
      positionSizeUsd = botConfig.positionSizeFixed;
    }

    // Calculate quantity
    const quantity = positionSizeUsd / entryPrice;

    // Get leverage
    const leverage = botConfig.leverageMode === "from_alert" 
      ? (data.leverage || botConfig.leverageFixed) 
      : botConfig.leverageFixed;

    console.log(`💰 Position size: $${positionSizeUsd}, Qty: ${quantity}, Leverage: ${leverage}x`);

    // ============================================
    // 🚀 OPEN POSITION ON EXCHANGE
    // ============================================

    try {
      const openPositionResponse = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/exchange/open-position`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exchange: "bybit",
            apiKey: process.env.BYBIT_API_KEY,
            apiSecret: process.env.BYBIT_API_SECRET,
            environment: process.env.BYBIT_ENVIRONMENT || "demo",
            symbol: data.symbol,
            side: data.side === "BUY" ? "Buy" : "Sell",
            quantity: quantity.toFixed(8),
            leverage: leverage,
            stopLoss: slPrice?.toFixed(2),
            takeProfit: tp1Price?.toFixed(2),
            tp1: tp1Price?.toFixed(2),
            tp2: tp2Price?.toFixed(2),
            tp3: tp3Price?.toFixed(2),
            tpMode: botConfig.tpStrategy || "main_only",
          }),
        }
      );

      if (!openPositionResponse.ok) {
        const errorData = await openPositionResponse.json();
        throw new Error(errorData.error || "Failed to open position");
      }

      const positionData = await openPositionResponse.json();
      console.log("✅ Position opened on exchange:", positionData);

      // ============================================
      // 💾 SAVE POSITION TO DATABASE
      // ============================================

      const [botPosition] = await db.insert(botPositions).values({
        symbol: data.symbol,
        side: data.side,
        entryPrice: entryPrice,
        quantity: quantity,
        leverage: leverage,
        stopLoss: slPrice || 0,
        tp1Price: tp1Price,
        tp2Price: tp2Price,
        tp3Price: tp3Price,
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
        bybitOrderId: positionData.orderId,
        openedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      }).returning();

      console.log("✅ Position saved to database:", botPosition.id);

      // Save action
      await db.insert(botActions).values({
        actionType: "position_opened",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        positionId: botPosition.id,
        reason: "new_signal",
        details: JSON.stringify({
          tier: data.tier,
          confidence: data.strength,
          entry: entryPrice,
          quantity: quantity,
          leverage: leverage,
        }),
        success: true,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        alert_id: alert.id,
        position_id: botPosition.id,
        message: "Alert received and position opened successfully",
        position: {
          symbol: data.symbol,
          side: data.side,
          entry: entryPrice,
          quantity: quantity,
          sl: slPrice,
          tp1: tp1Price,
          tp2: tp2Price,
          tp3: tp3Price,
        },
      });
    } catch (error: any) {
      console.error("❌ Failed to open position:", error);

      // Save failed action
      await db.insert(botActions).values({
        actionType: "position_failed",
        symbol: data.symbol,
        side: data.side,
        tier: data.tier,
        alertId: alert.id,
        reason: "exchange_error",
        details: JSON.stringify({ error: error.message }),
        success: false,
        errorMessage: error.message,
        createdAt: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          alert_id: alert.id,
          error: error.message,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("❌ Webhook error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}