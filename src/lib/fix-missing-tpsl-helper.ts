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
    return [];
  }

  return data.data?.filter((p: any) => parseFloat(p.pos) !== 0) || [];
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

// ============================================
// ✅ SET ATTACHED SL/TP ALGO ORDERS
// ============================================

async function setSlTpAlgoOrder(
  symbol: string,
  slPrice: number | null,
  tpPrice: number | null,
  quantity: number,
  side: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  console.log(`\n🎯 [AUTO-FIX] Setting SL/TP for ${symbol} ${side} qty=${quantity}`);
  
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/order-algo";
  
  const algoSide = side === "LONG" ? "sell" : "buy";
  const posSide = side === "LONG" ? "long" : "short";
  
  const results = {
    slSuccess: false,
    tpSuccess: false,
    slAlgoId: null as string | null,
    tpAlgoId: null as string | null,
    errors: [] as string[]
  };

  // Set Stop Loss first
  if (slPrice) {
    console.log(`   [AUTO-FIX] Setting SL @ ${slPrice}`);
    
    const slPayload: any = {
      instId: symbol,
      tdMode: "cross",
      side: algoSide,
      posSide: posSide,
      ordType: "conditional",
      sz: quantity.toString(),
      slTriggerPx: slPrice.toString(),
      slOrdPx: "-1",
    };

    const slBodyString = JSON.stringify(slPayload);
    const slSignature = createOkxSignature(timestamp, method, requestPath, slBodyString, apiSecret);

    const headers: Record<string, string> = {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": slSignature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    };

    if (demo) {
      headers["x-simulated-trading"] = "1";
    }

    try {
      const response = await fetch(`https://www.okx.com${requestPath}`, {
        method: "POST",
        headers,
        body: slBodyString,
      });

      const data = await response.json();

      if (data.code === "0" && data.data && data.data.length > 0) {
        results.slSuccess = true;
        results.slAlgoId = data.data[0].algoId;
        console.log(`   ✅ [AUTO-FIX] SL set: ${results.slAlgoId}`);
      } else {
        const error = `SL failed: ${data.msg}`;
        console.error(`   ❌ [AUTO-FIX] ${error}`);
        results.errors.push(error);
      }
    } catch (error) {
      const errorMsg = `SL request failed: ${error instanceof Error ? error.message : "Unknown"}`;
      console.error(`   ❌ [AUTO-FIX] ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  // Set Take Profit
  if (tpPrice) {
    console.log(`   [AUTO-FIX] Setting TP @ ${tpPrice}`);
    
    const tpTimestamp = new Date().toISOString();
    
    const tpPayload: any = {
      instId: symbol,
      tdMode: "cross",
      side: algoSide,
      posSide: posSide,
      ordType: "conditional",
      sz: quantity.toString(),
      tpTriggerPx: tpPrice.toString(),
      tpOrdPx: "-1",
    };

    const tpBodyString = JSON.stringify(tpPayload);
    const tpSignature = createOkxSignature(tpTimestamp, method, requestPath, tpBodyString, apiSecret);

    const headers: Record<string, string> = {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": tpSignature,
      "OK-ACCESS-TIMESTAMP": tpTimestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    };

    if (demo) {
      headers["x-simulated-trading"] = "1";
    }

    try {
      const response = await fetch(`https://www.okx.com${requestPath}`, {
        method: "POST",
        headers,
        body: tpBodyString,
      });

      const data = await response.json();

      if (data.code === "0" && data.data && data.data.length > 0) {
        results.tpSuccess = true;
        results.tpAlgoId = data.data[0].algoId;
        console.log(`   ✅ [AUTO-FIX] TP set: ${results.tpAlgoId}`);
      } else {
        const error = `TP failed: ${data.msg}`;
        console.error(`   ❌ [AUTO-FIX] ${error}`);
        results.errors.push(error);
      }
    } catch (error) {
      const errorMsg = `TP request failed: ${error instanceof Error ? error.message : "Unknown"}`;
      console.error(`   ❌ [AUTO-FIX] ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  if (!results.slSuccess && !results.tpSuccess) {
    throw new Error(`Failed to set both SL and TP: ${results.errors.join(", ")}`);
  }

  return results;
}

// ============================================
// 🔧 MAIN FUNCTION: AUTO-FIX MISSING SL/TP
// ============================================

export async function autoFixMissingSlTp(silent = true) {
  try {
    if (!silent) {
      console.log("\n🔧 [AUTO-FIX] Starting auto-fix for missing SL/TP...");
    }

    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret || !settings[0].passphrase) {
      if (!silent) {
        console.log("⚠️ [AUTO-FIX] API credentials not configured");
      }
      return { success: false, reason: "no_credentials" };
    }

    const botConfig = settings[0];
    const apiKey = botConfig.apiKey!;
    const apiSecret = botConfig.apiSecret!;
    const passphrase = botConfig.passphrase!;
    const demo = botConfig.environment === "demo";

    const useDefaultSlTp = botConfig.useDefaultSlTp || false;
    if (!useDefaultSlTp) {
      if (!silent) {
        console.log("⚠️ [AUTO-FIX] Default SL/TP not enabled");
      }
      return { success: false, reason: "feature_disabled" };
    }

    const defaultSlRR = botConfig.defaultSlRR || 1.0;
    const tp1RR = botConfig.tp1RR || 1.0;
    const tpCount = botConfig.tpCount || 3;

    const okxPositions = await getOkxPositions(apiKey, apiSecret, passphrase, demo);
    
    let fixed = 0;
    let closed = 0;
    let errors: string[] = [];

    for (const position of okxPositions) {
      const symbol = position.instId;
      const pos = parseFloat(position.pos);
      const side = pos > 0 ? "LONG" : "SHORT";
      const entryPrice = parseFloat(position.avgPx);
      const quantity = Math.abs(pos);

      if (!silent) {
        console.log(`\n🔍 [AUTO-FIX] Checking ${symbol} ${side}`);
      }

      let currentPrice: number;
      try {
        currentPrice = await getCurrentMarketPrice(symbol, apiKey, apiSecret, passphrase, demo);
      } catch (error) {
        if (!silent) {
          console.error(`❌ [AUTO-FIX] Failed to get price for ${symbol}`);
        }
        continue;
      }

      let slPrice: number;
      let tpPrice: number;

      if (side === "LONG") {
        slPrice = entryPrice * (1 - (defaultSlRR / 100));
        tpPrice = entryPrice * (1 + (tp1RR / 100));
      } else {
        slPrice = entryPrice * (1 + (defaultSlRR / 100));
        tpPrice = entryPrice * (1 - (tp1RR / 100));
      }

      let slHit: boolean;
      let tpHit: boolean;

      if (side === "LONG") {
        slHit = currentPrice <= slPrice;
        tpHit = currentPrice >= tpPrice;
      } else {
        slHit = currentPrice >= slPrice;
        tpHit = currentPrice <= tpPrice;
      }

      if (slHit) {
        if (!silent) {
          console.log(`   ⚠️ [AUTO-FIX] SL already hit - closing ${symbol}`);
        }
        try {
          await closePosition(symbol, apiKey, apiSecret, passphrase, demo);
          closed++;

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
        } catch (error) {
          errors.push(`Failed to close ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`);
        }
        continue;
      }

      if (tpHit) {
        if (!silent) {
          console.log(`   ⚠️ [AUTO-FIX] TP already hit - closing ${symbol}`);
        }
        try {
          await closePosition(symbol, apiKey, apiSecret, passphrase, demo);
          closed++;

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
        } catch (error) {
          errors.push(`Failed to close ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`);
        }
        continue;
      }

      // Position is safe - set SL/TP algo orders
      try {
        await setSlTpAlgoOrder(
          symbol, 
          slPrice, 
          tpPrice, 
          quantity,
          side,
          apiKey, 
          apiSecret, 
          passphrase, 
          demo
        );
        
        fixed++;
        if (!silent) {
          console.log(`   ✅ [AUTO-FIX] SL/TP set for ${symbol}`);
        }
      } catch (error) {
        errors.push(`Failed to set SL/TP for ${symbol}: ${error instanceof Error ? error.message : "Unknown"}`);
      }
    }

    if (!silent) {
      console.log(`\n✅ [AUTO-FIX] Completed - Fixed: ${fixed}, Closed: ${closed}, Errors: ${errors.length}`);
    }

    return {
      success: true,
      fixed,
      closed,
      errors,
      checked: okxPositions.length
    };

  } catch (error) {
    console.error("❌ [AUTO-FIX] Error:", error);
    return {
      success: false,
      reason: "error",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}
