import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings, botPositions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// ============================================
// 🔐 OKX SIGNATURE HELPER
// ============================================

function createOkxSignature(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  apiSecret: string
): string {
  const message = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', apiSecret).update(message).digest('base64');
}

// ============================================
// 🔄 SYMBOL CONVERSION FOR OKX
// ============================================

function convertSymbolToOkx(symbol: string): string {
  if (symbol.includes('-')) {
    return symbol;
  }
  
  const match = symbol.match(/^([A-Z0-9]+)(USDT|USD)$/i);
  if (match) {
    const [, base, quote] = match;
    return `${base.toUpperCase()}-${quote.toUpperCase()}-SWAP`;
  }
  
  return symbol;
}

// ============================================
// 🏦 GET OPEN POSITIONS FROM OKX
// ============================================

async function getOkxPositions(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/positions";
  const queryString = "?instType=SWAP";
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
  const baseUrl = "https://www.okx.com";
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }
  
  const response = await fetch(`${baseUrl}${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0") {
    throw new Error(`OKX API error: ${data.msg}`);
  }

  return data.data?.filter((p: any) => parseFloat(p.pos) !== 0) || [];
}

// ============================================
// 📊 GET CURRENT MARKET PRICE FROM OKX
// ============================================

async function getCurrentMarketPrice(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<number> {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = `/api/v5/market/ticker`;
  const queryString = `?instId=${symbol}`;
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
  const baseUrl = "https://www.okx.com";
  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
  
  if (demo) {
    headers["x-simulated-trading"] = "1";
  }
  
  const response = await fetch(`${baseUrl}${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0" || !data.data || data.data.length === 0) {
    throw new Error(`Failed to get market price for ${symbol}`);
  }

  return parseFloat(data.data[0].last);
}

// ============================================
// 🔧 SET SL/TP FOR POSITION
// ============================================

async function setSlTpForPosition(
  symbol: string,
  slPrice: number | null,
  tpPrice: number | null,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/order-algo";
  
  const payload: any = {
    instId: symbol,
    tdMode: "cross",
    side: "buy", // Will be adjusted based on position
    ordType: "conditional",
  };

  if (slPrice) {
    payload.slTriggerPx = slPrice.toString();
    payload.slOrdPx = "-1";
  }

  if (tpPrice) {
    payload.tpTriggerPx = tpPrice.toString();
    payload.tpOrdPx = "-1";
  }

  const bodyString = JSON.stringify(payload);
  const signature = createOkxSignature(timestamp, method, requestPath, bodyString, apiSecret);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  const response = await fetch(`https://www.okx.com${requestPath}`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  if (data.code !== "0") {
    throw new Error(`Failed to set SL/TP: ${data.msg}`);
  }

  return data.data;
}

// ============================================
// 🔨 CLOSE POSITION
// ============================================

async function closePosition(
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/close-position";
  
  const payload = {
    instId: symbol,
    mgnMode: "cross",
  };

  const bodyString = JSON.stringify(payload);
  const signature = createOkxSignature(timestamp, method, requestPath, bodyString, apiSecret);

  const headers: Record<string, string> = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": signature,
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };

  if (demo) {
    headers["x-simulated-trading"] = "1";
  }

  const response = await fetch(`https://www.okx.com${requestPath}`, {
    method: "POST",
    headers,
    body: bodyString,
  });

  const data = await response.json();

  if (data.code !== "0") {
    throw new Error(`Failed to close position: ${data.msg}`);
  }

  return data.data;
}

export async function POST(request: NextRequest) {
  try {
    console.log("\n🔧 Starting fix-missing-tpsl process...");

    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret || !settings[0].passphrase) {
      return NextResponse.json({
        success: false,
        message: "OKX API credentials not configured in bot settings",
      }, { status: 400 });
    }

    const botConfig = settings[0];
    const apiKey = botConfig.apiKey!;
    const apiSecret = botConfig.apiSecret!;
    const passphrase = botConfig.passphrase!;
    const demo = botConfig.environment === "demo";

    // Get default SL/TP settings
    const useDefaultSlTp = botConfig.useDefaultSlTp || false;
    const defaultSlRR = botConfig.defaultSlRR || 1.0;
    const defaultTp1RR = botConfig.defaultTp1RR || 1.0;

    if (!useDefaultSlTp) {
      return NextResponse.json({
        success: false,
        message: "Domyślne SL/TP nie jest włączone w ustawieniach bota. Włącz 'Zabezpieczenie SL/TP' w ustawieniach.",
      }, { status: 400 });
    }

    console.log(`📊 Default SL RR: ${defaultSlRR}%, Default TP RR: ${defaultTp1RR}%`);

    // Get all open positions from OKX
    console.log("\n📡 Fetching positions from OKX...");
    const okxPositions = await getOkxPositions(apiKey, apiSecret, passphrase, demo);
    console.log(`✅ Found ${okxPositions.length} open positions on OKX`);

    const results = {
      checked: 0,
      fixed: 0,
      closed: 0,
      skipped: 0,
      errors: [] as string[],
      details: [] as any[]
    };

    for (const position of okxPositions) {
      results.checked++;
      
      const symbol = position.instId;
      const pos = parseFloat(position.pos);
      const side = pos > 0 ? "LONG" : "SHORT";
      const entryPrice = parseFloat(position.avgPx);
      const leverage = parseFloat(position.lever);

      console.log(`\n🔍 Checking ${symbol} ${side} @ ${entryPrice}`);

      // Get current market price
      let currentPrice: number;
      try {
        currentPrice = await getCurrentMarketPrice(symbol, apiKey, apiSecret, passphrase, demo);
        console.log(`   Current market price: ${currentPrice}`);
      } catch (error) {
        const errorMsg = `Failed to get market price for ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`;
        console.error(`   ❌ ${errorMsg}`);
        results.errors.push(errorMsg);
        continue;
      }

      // Check if position has SL/TP set (OKX doesn't return SL/TP in positions endpoint directly)
      // We'll assume positions without algo orders need SL/TP
      // For simplicity, we'll try to set SL/TP for all positions
      
      // Calculate SL and TP based on entry price and RR settings
      let slPrice: number;
      let tpPrice: number;

      if (side === "LONG") {
        // LONG: SL below entry, TP above entry
        slPrice = entryPrice * (1 - (defaultSlRR / 100));
        tpPrice = entryPrice * (1 + (defaultTp1RR / 100));
      } else {
        // SHORT: SL above entry, TP below entry
        slPrice = entryPrice * (1 + (defaultSlRR / 100));
        tpPrice = entryPrice * (1 - (defaultTp1RR / 100));
      }

      console.log(`   Calculated SL: ${slPrice}, TP: ${tpPrice}`);

      // Check if current price already hit SL or TP
      const slHit = side === "LONG" ? currentPrice <= slPrice : currentPrice >= slPrice;
      const tpHit = side === "LONG" ? currentPrice >= tpPrice : currentPrice <= tpPrice;

      if (slHit) {
        console.log(`   ⚠️ Current price (${currentPrice}) already hit SL (${slPrice}). Closing position...`);
        try {
          await closePosition(symbol, apiKey, apiSecret, passphrase, demo);
          results.closed++;
          results.details.push({
            symbol,
            side,
            action: "closed",
            reason: "SL already hit",
            entryPrice,
            currentPrice,
            slPrice
          });
          console.log(`   ✅ Position closed due to SL hit`);

          // Update position in database if exists
          const dbPositions = await db.select()
            .from(botPositions)
            .where(eq(botPositions.symbol, symbol.replace("-USDT-SWAP", "USDT")));
          
          for (const dbPos of dbPositions) {
            if (dbPos.status === "open") {
              await db.update(botPositions)
                .set({
                  status: "closed",
                  closeReason: "sl_hit_auto_fix",
                  closedAt: new Date().toISOString()
                })
                .where(eq(botPositions.id, dbPos.id));
            }
          }

          continue;
        } catch (error) {
          const errorMsg = `Failed to close ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`;
          console.error(`   ❌ ${errorMsg}`);
          results.errors.push(errorMsg);
          continue;
        }
      }

      if (tpHit) {
        console.log(`   ⚠️ Current price (${currentPrice}) already hit TP (${tpPrice}). Closing position...`);
        try {
          await closePosition(symbol, apiKey, apiSecret, passphrase, demo);
          results.closed++;
          results.details.push({
            symbol,
            side,
            action: "closed",
            reason: "TP already hit",
            entryPrice,
            currentPrice,
            tpPrice
          });
          console.log(`   ✅ Position closed due to TP hit`);

          // Update position in database if exists
          const dbPositions = await db.select()
            .from(botPositions)
            .where(eq(botPositions.symbol, symbol.replace("-USDT-SWAP", "USDT")));
          
          for (const dbPos of dbPositions) {
            if (dbPos.status === "open") {
              await db.update(botPositions)
                .set({
                  status: "closed",
                  closeReason: "tp_hit_auto_fix",
                  closedAt: new Date().toISOString()
                })
                .where(eq(botPositions.id, dbPos.id));
            }
          }

          continue;
        } catch (error) {
          const errorMsg = `Failed to close ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`;
          console.error(`   ❌ ${errorMsg}`);
          results.errors.push(errorMsg);
          continue;
        }
      }

      // If neither SL nor TP hit, try to set SL/TP
      console.log(`   🔧 Setting SL/TP for position...`);
      try {
        // Note: OKX algo orders are complex - for now we'll log that manual intervention may be needed
        // This is a placeholder for the actual implementation
        console.log(`   ⚠️ Automatic SL/TP setting requires manual configuration through OKX algo orders API`);
        console.log(`   💡 Recommended: Use OKX web interface to set SL/TP manually for ${symbol}`);
        
        results.skipped++;
        results.details.push({
          symbol,
          side,
          action: "skipped",
          reason: "Manual SL/TP setting required - use OKX interface",
          entryPrice,
          currentPrice,
          recommendedSl: slPrice,
          recommendedTp: tpPrice
        });

      } catch (error) {
        const errorMsg = `Failed to set SL/TP for ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`;
        console.error(`   ❌ ${errorMsg}`);
        results.errors.push(errorMsg);
        continue;
      }
    }

    console.log("\n✅ Fix-missing-tpsl process completed");
    console.log(`   Checked: ${results.checked}`);
    console.log(`   Fixed: ${results.fixed}`);
    console.log(`   Closed: ${results.closed}`);
    console.log(`   Skipped: ${results.skipped}`);
    console.log(`   Errors: ${results.errors.length}`);

    return NextResponse.json({
      success: true,
      message: "Process completed",
      results,
    });

  } catch (error) {
    console.error("❌ Fix-missing-tpsl error:", error);
    return NextResponse.json({
      success: false,
      message: `Process failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    }, { status: 500 });
  }
}
