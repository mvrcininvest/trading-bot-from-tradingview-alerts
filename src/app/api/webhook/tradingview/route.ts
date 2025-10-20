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
      "ticker",
      "action",
      "tier",
      "direction",
      "entry",
      "confidence",
      "confirmations",
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
      ticker: data.ticker,
      action: data.action,
      tier: data.tier,
      direction: data.direction,
      entry: data.entry?.toString() || "0",
      sl: data.sl?.toString() || null,
      tp1: data.tp1?.toString() || null,
      tp2: data.tp2?.toString() || null,
      tp3: data.tp3?.toString() || null,
      main_tp: data.main_tp?.toString() || null,
      confidence: data.confidence,
      confirmations: data.confirmations,
      rawData: JSON.stringify(data),
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
    if (!botConfig.enabled) {
      console.log("🛑 Bot is disabled");
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: "Alert saved, but bot is disabled"
      });
    }

    // Tier filtering
    const allowedTiers = [
      botConfig.tier1Enabled && "1",
      botConfig.tier2Enabled && "2",
      botConfig.tier3Enabled && "3",
    ].filter(Boolean) as string[];

    if (!allowedTiers.includes(data.tier)) {
      console.log(`⚠️ Alert tier ${data.tier} not enabled`);
      await db.insert(botActions).values({
        actionType: "alert_filtered",
        symbol: data.ticker,
        details: JSON.stringify({ reason: "tier_not_enabled", tier: data.tier }),
      });
      return NextResponse.json({ 
        success: true, 
        alert_id: alert.id,
        message: `Alert tier ${data.tier} not enabled`
      });
    }

    // Check for existing positions on same symbol
    const existingPositions = await db
      .select()
      .from(botPositions)
      .where(
        and(
          eq(botPositions.symbol, data.ticker),
          eq(botPositions.status, "open")
        )
      );

    // Same Symbol Logic
    if (existingPositions.length > 0) {
      const existingPosition = existingPositions[0];
      
      if (botConfig.sameSymbolAction === "ignore") {
        console.log(`⚠️ Position already exists on ${data.ticker}, ignoring`);
        await db.insert(botActions).values({
          actionType: "alert_ignored",
          symbol: data.ticker,
          details: JSON.stringify({ reason: "same_symbol_ignore" }),
        });
        return NextResponse.json({ 
          success: true, 
          alert_id: alert.id,
          message: "Same symbol position exists, ignoring alert"
        });
      }

      // Check if opposite direction
      const isOpposite = 
        (existingPosition.direction === "long" && data.direction === "short") ||
        (existingPosition.direction === "short" && data.direction === "long");

      if (isOpposite) {
        if (botConfig.oppositeDirectionAction === "close_and_reverse") {
          console.log(`🔄 Closing opposite position and reversing on ${data.ticker}`);
          
          // Close existing position
          try {
            const closeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/exchange/close-position`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                symbol: data.ticker,
                positionIdx: existingPosition.direction === "long" ? 1 : 2,
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
                closedAt: new Date(),
              })
              .where(eq(botPositions.id, existingPosition.id));

            await db.insert(botActions).values({
              actionType: "position_closed",
              symbol: data.ticker,
              positionId: existingPosition.id,
              details: JSON.stringify({ reason: "opposite_signal" }),
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
        } else if (botConfig.oppositeDirectionAction === "ignore") {
          console.log(`⚠️ Opposite direction signal on ${data.ticker}, ignoring`);
          await db.insert(botActions).values({
            actionType: "alert_ignored",
            symbol: data.ticker,
            details: JSON.stringify({ reason: "opposite_direction_ignore" }),
          });
          return NextResponse.json({ 
            success: true, 
            alert_id: alert.id,
            message: "Opposite direction signal, ignoring alert"
          });
        }
      } else {
        // Same direction - add to position or ignore based on sameSymbolAction
        if (botConfig.sameSymbolAction === "add_to_position") {
          console.log(`➕ Adding to existing position on ${data.ticker}`);
          // Continue with opening new position
        }
      }
    }

    // ============================================
    // 🎯 CALCULATE SL/TP VALUES
    // ============================================
    
    const entryPrice = parseFloat(data.entry);
    let slPrice: number | null = null;
    let tp1Price: number | null = null;
    let tp2Price: number | null = null;
    let tp3Price: number | null = null;

    // Check if alert contains SL/TP values
    const hasSlTpInAlert = data.sl && data.tp1 && data.tp2 && data.tp3;

    if (hasSlTpInAlert) {
      // Use values from alert (priority)
      console.log("✅ Using SL/TP from alert");
      slPrice = parseFloat(data.sl);
      tp1Price = parseFloat(data.tp1);
      tp2Price = parseFloat(data.tp2);
      tp3Price = parseFloat(data.tp3);
    } else if (botConfig.useDefaultSlTp) {
      // Calculate default SL/TP based on entry price
      console.log("🛡️ Using default SL/TP from settings");
      
      const slPercent = botConfig.defaultSlPercent / 100;
      const tp1Percent = botConfig.defaultTp1Percent / 100;
      const tp2Percent = botConfig.defaultTp2Percent / 100;
      const tp3Percent = botConfig.defaultTp3Percent / 100;

      if (data.direction === "long") {
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
        symbol: data.ticker,
        details: JSON.stringify({ reason: "no_sl_tp_provided" }),
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

    let positionSizeUsd = botConfig.positionSizeUsd;

    if (botConfig.tierBasedSize) {
      if (data.tier === "1") positionSizeUsd = botConfig.tier1SizeUsd;
      else if (data.tier === "2") positionSizeUsd = botConfig.tier2SizeUsd;
      else if (data.tier === "3") positionSizeUsd = botConfig.tier3SizeUsd;
    }

    // Calculate quantity
    const quantity = positionSizeUsd / entryPrice;

    // Get leverage
    const leverage = botConfig.leverage;

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
            symbol: data.ticker,
            side: data.direction === "long" ? "Buy" : "Sell",
            qty: quantity.toFixed(8),
            leverage: leverage,
            sl: slPrice?.toFixed(2),
            tp1: tp1Price?.toFixed(2),
            tp2: tp2Price?.toFixed(2),
            tp3: tp3Price?.toFixed(2),
            mainTp: data.main_tp,
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
        symbol: data.ticker,
        direction: data.direction,
        entryPrice: entryPrice.toString(),
        quantity: quantity.toString(),
        leverage: leverage,
        sl: slPrice?.toString() || null,
        tp1: tp1Price?.toString() || null,
        tp2: tp2Price?.toString() || null,
        tp3: tp3?.toString() || null,
        mainTp: data.main_tp,
        tier: data.tier,
        confidence: data.confidence,
        confirmations: data.confirmations,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        status: "open",
        alertId: alert.id,
      }).returning();

      console.log("✅ Position saved to database:", botPosition.id);

      // Save action
      await db.insert(botActions).values({
        actionType: "position_opened",
        symbol: data.ticker,
        positionId: botPosition.id,
        details: JSON.stringify({
          tier: data.tier,
          confidence: data.confidence,
          entry: entryPrice,
          quantity: quantity,
          leverage: leverage,
        }),
      });

      return NextResponse.json({
        success: true,
        alert_id: alert.id,
        position_id: botPosition.id,
        message: "Alert received and position opened successfully",
        position: {
          symbol: data.ticker,
          direction: data.direction,
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
        symbol: data.ticker,
        details: JSON.stringify({ error: error.message }),
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