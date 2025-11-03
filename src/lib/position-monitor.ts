import { db } from '@/db';
import { botSettings, botPositions, botLogs } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
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
// 📊 GET CURRENT MARKET PRICE
// ============================================

async function getCurrentPrice(
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
  
  const response = await fetch(`https://www.okx.com${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0" || !data.data || data.data.length === 0) {
    throw new Error(`Failed to get price for ${symbol}`);
  }

  return parseFloat(data.data[0].last);
}

// ============================================
// 🏦 GET ALGO ORDERS (CHECK EXISTING SL/TP)
// ============================================

async function getAlgoOrders(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<any[]> {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/trade/orders-algo-pending";
  const queryString = "?ordType=conditional";
  const body = "";
  
  const signature = createOkxSignature(timestamp, method, requestPath + queryString, body, apiSecret);
  
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
  
  const response = await fetch(`https://www.okx.com${requestPath}${queryString}`, {
    method: "GET",
    headers,
  });

  const data = await response.json();

  if (data.code !== "0") {
    console.error(`Failed to get algo orders: ${data.msg}`);
    return [];
  }

  return data.data || [];
}

// ============================================
// 🔨 CLOSE POSITION PARTIALLY (MARKET ORDER)
// ============================================

async function closePositionPartial(
  symbol: string,
  side: string,
  quantity: number,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<string> {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/order";
  
  const payload = {
    instId: symbol,
    tdMode: "cross",
    side: side === "BUY" ? "sell" : "buy", // Opposite side to close
    ordType: "market",
    sz: quantity.toString(),
    posSide: side === "BUY" ? "long" : "short",
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
    throw new Error(`Failed to close position: ${data.msg} (code: ${data.code})`);
  }

  return data.data?.[0]?.ordId || "unknown";
}

// ============================================
// 🔄 CANCEL ALGO ORDER
// ============================================

async function cancelAlgoOrder(
  algoId: string,
  symbol: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/cancel-algos";
  
  const payload = [{
    algoId,
    instId: symbol,
  }];

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

  return data.code === "0";
}

// ============================================
// 🎯 SET NEW ALGO ORDER (SL/TP)
// ============================================

async function setAlgoOrder(
  symbol: string,
  side: string,
  quantity: number,
  triggerPrice: number,
  orderType: "sl" | "tp",
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
): Promise<string | null> {
  const timestamp = new Date().toISOString();
  const method = "POST";
  const requestPath = "/api/v5/trade/order-algo";
  
  const algoSide = side === "BUY" ? "sell" : "buy";
  const posSide = side === "BUY" ? "long" : "short";
  
  const payload: any = {
    instId: symbol,
    tdMode: "cross",
    side: algoSide,
    posSide: posSide,
    ordType: "conditional",
    sz: quantity.toString(),
  };

  if (orderType === "sl") {
    payload.slTriggerPx = triggerPrice.toString();
    payload.slOrdPx = "-1"; // Market order when triggered
  } else {
    payload.tpTriggerPx = triggerPrice.toString();
    payload.tpOrdPx = "-1"; // Market order when triggered
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
    console.error(`Failed to set ${orderType.toUpperCase()}: ${data.msg}`);
    return null;
  }

  return data.data?.[0]?.algoId || null;
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
  
  const response = await fetch(`https://www.okx.com${requestPath}${queryString}`, {
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
// 🤖 MAIN MONITOR FUNCTION
// ============================================

export async function monitorAndManagePositions(silent = true) {
  try {
    // ALWAYS log when starting monitor (even in silent mode)
    console.log("\n🔍 [MONITOR] Starting position monitoring...");

    // Get settings
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey) {
      console.log("⚠️ [MONITOR] No credentials found");
      return { success: false, reason: "no_credentials" };
    }

    const config = settings[0];
    const apiKey = config.apiKey!;
    const apiSecret = config.apiSecret!;
    const passphrase = config.passphrase!;
    const demo = config.environment === "demo";

    // Get bot positions from DB
    const dbPositions = await db.select()
      .from(botPositions)
      .where(eq(botPositions.status, "open"));

    console.log(`📊 [MONITOR] Found ${dbPositions.length} open positions in database`);

    if (dbPositions.length === 0) {
      return { success: true, checked: 0, tpHits: 0, slAdjustments: 0, slTpFixed: 0 };
    }

    // Get OKX positions
    const okxPositions = await getOkxPositions(apiKey, apiSecret, passphrase, demo);
    
    // Get existing algo orders
    const algoOrders = await getAlgoOrders(apiKey, apiSecret, passphrase, demo);
    
    console.log(`📊 [MONITOR] OKX Positions: ${okxPositions.length}, Algo Orders: ${algoOrders.length}`);

    let tpHits = 0;
    let slAdjustments = 0;
    let slTpFixed = 0;
    const errors: string[] = [];
    const details: any[] = [];

    for (const dbPos of dbPositions) {
      const symbol = dbPos.symbol.includes("-") ? dbPos.symbol : `${dbPos.symbol.replace("USDT", "")}-USDT-SWAP`;
      
      console.log(`\n🔍 [MONITOR] Checking ${symbol} (${dbPos.side})...`);
      
      // Find matching OKX position
      const okxPos = okxPositions.find((p: any) => p.instId === symbol);
      
      if (!okxPos) {
        console.log(`⚠️ [MONITOR] ${symbol} not found on exchange - marking as closed`);
        
        await db.update(botPositions)
          .set({
            status: "closed",
            closeReason: "closed_on_exchange",
            closedAt: new Date().toISOString(),
          })
          .where(eq(botPositions.id, dbPos.id));
        
        details.push({
          symbol,
          side: dbPos.side,
          action: "closed",
          reason: "Position not found on exchange"
        });
        
        continue;
      }

      // Get current price
      const currentPrice = await getCurrentPrice(symbol, apiKey, apiSecret, passphrase, demo);
      const quantity = Math.abs(parseFloat(okxPos.pos));
      const side = dbPos.side;
      const entryPrice = dbPos.entryPrice;
      
      console.log(`   Entry: ${entryPrice}, Current: ${currentPrice}, Qty: ${quantity}`);

      // ============================================
      // 🎯 CHECK TP LEVELS AND PARTIAL CLOSE
      // ============================================

      const isLong = side === "BUY";
      
      // TP1 Check
      if (dbPos.tp1Price && !dbPos.tp1Hit) {
        const tp1Hit = isLong 
          ? currentPrice >= dbPos.tp1Price 
          : currentPrice <= dbPos.tp1Price;
        
        if (tp1Hit) {
          console.log(`   🎯 TP1 HIT @ ${dbPos.tp1Price}! Closing partial position...`);
          
          const closePercent = config.tp1Percent || 50.0;
          const closeQty = (quantity * closePercent) / 100;
          
          try {
            const orderId = await closePositionPartial(
              symbol, 
              side, 
              closeQty, 
              apiKey, 
              apiSecret, 
              passphrase, 
              demo
            );
            
            console.log(`   ✅ Closed ${closePercent}% (${closeQty}) @ market - Order: ${orderId}`);
            
            await db.update(botPositions)
              .set({
                tp1Hit: true,
                quantity: quantity - closeQty,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp1_hit",
              reason: `Closed ${closePercent}% @ ${currentPrice}`
            });
            
            // Adjust SL based on strategy
            if (config.slManagementAfterTp1 === "breakeven") {
              console.log(`   📈 Moving SL to breakeven @ ${entryPrice}`);
              
              const slAlgos = algoOrders.filter((a: any) => 
                a.instId === symbol && a.slTriggerPx
              );
              
              for (const algo of slAlgos) {
                await cancelAlgoOrder(algo.algoId, symbol, apiKey, apiSecret, passphrase, demo);
              }
              
              await setAlgoOrder(
                symbol,
                side,
                quantity - closeQty,
                entryPrice,
                "sl",
                apiKey,
                apiSecret,
                passphrase,
                demo
              );
              
              await db.update(botPositions)
                .set({ currentSl: entryPrice })
                .where(eq(botPositions.id, dbPos.id));
              
              slAdjustments++;
            } else if (config.slManagementAfterTp1 === "trailing") {
              const trailingDist = config.slTrailingDistance || 0.5;
              const newSl = isLong 
                ? currentPrice * (1 - trailingDist / 100)
                : currentPrice * (1 + trailingDist / 100);
              
              console.log(`   📈 Trailing SL to ${newSl.toFixed(4)}`);
              
              const slAlgos = algoOrders.filter((a: any) => 
                a.instId === symbol && a.slTriggerPx
              );
              
              for (const algo of slAlgos) {
                await cancelAlgoOrder(algo.algoId, symbol, apiKey, apiSecret, passphrase, demo);
              }
              
              await setAlgoOrder(
                symbol,
                side,
                quantity - closeQty,
                newSl,
                "sl",
                apiKey,
                apiSecret,
                passphrase,
                demo
              );
              
              await db.update(botPositions)
                .set({ currentSl: newSl })
                .where(eq(botPositions.id, dbPos.id));
              
              slAdjustments++;
            }
            
          } catch (error: any) {
            const errMsg = `Failed to close TP1 for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }

      // TP2 Check
      if (dbPos.tp2Price && dbPos.tp1Hit && !dbPos.tp2Hit) {
        const tp2Hit = isLong 
          ? currentPrice >= dbPos.tp2Price 
          : currentPrice <= dbPos.tp2Price;
        
        if (tp2Hit) {
          console.log(`   🎯 TP2 HIT @ ${dbPos.tp2Price}!`);
          
          const closePercent = config.tp2Percent || 30.0;
          const currentQty = dbPos.quantity;
          const closeQty = (currentQty * closePercent) / 100;
          
          try {
            const orderId = await closePositionPartial(
              symbol, 
              side, 
              closeQty, 
              apiKey, 
              apiSecret, 
              passphrase, 
              demo
            );
            
            console.log(`   ✅ Closed ${closePercent}% (${closeQty}) @ market - Order: ${orderId}`);
            
            await db.update(botPositions)
              .set({
                tp2Hit: true,
                quantity: currentQty - closeQty,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp2_hit",
              reason: `Closed ${closePercent}% @ ${currentPrice}`
            });
            
          } catch (error: any) {
            const errMsg = `Failed to close TP2 for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }

      // TP3 Check
      if (dbPos.tp3Price && dbPos.tp2Hit && !dbPos.tp3Hit) {
        const tp3Hit = isLong 
          ? currentPrice >= dbPos.tp3Price 
          : currentPrice <= dbPos.tp3Price;
        
        if (tp3Hit) {
          console.log(`   🎯 TP3 HIT @ ${dbPos.tp3Price}! Closing remaining position...`);
          
          const currentQty = dbPos.quantity;
          
          try {
            const orderId = await closePositionPartial(
              symbol, 
              side, 
              currentQty, 
              apiKey, 
              apiSecret, 
              passphrase, 
              demo
            );
            
            console.log(`   ✅ Closed remaining ${currentQty} @ market - Order: ${orderId}`);
            
            await db.update(botPositions)
              .set({
                tp3Hit: true,
                status: "closed",
                closeReason: "tp3_hit",
                closedAt: new Date().toISOString(),
              })
              .where(eq(botPositions.id, dbPos.id));
            
            tpHits++;
            details.push({
              symbol,
              side,
              action: "tp3_hit",
              reason: `Closed remaining @ ${currentPrice}`
            });
            
          } catch (error: any) {
            const errMsg = `Failed to close TP3 for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }

      // ============================================
      // 🛡️ CHECK AND FIX MISSING SL/TP ALGO ORDERS
      // ============================================

      const positionAlgos = algoOrders.filter((a: any) => a.instId === symbol);
      const hasSL = positionAlgos.some((a: any) => a.slTriggerPx);
      const hasTP = positionAlgos.some((a: any) => a.tpTriggerPx);

      console.log(`   🔍 Algo Orders: SL=${hasSL}, TP=${hasTP} (Total: ${positionAlgos.length})`);

      if (!hasSL || !hasTP) {
        console.log(`   ⚠️ MISSING ${!hasSL ? 'SL' : ''} ${!hasTP ? 'TP' : ''} - FIXING NOW...`);
        
        const slRR = config.defaultSlRR || 1.0;
        const nextTpRR = !dbPos.tp1Hit ? (config.tp1RR || 1.0) 
                        : !dbPos.tp2Hit ? (config.tp2RR || 2.0)
                        : (config.tp3RR || 3.0);
        
        let newSL: number;
        let newTP: number;
        
        if (isLong) {
          newSL = entryPrice * (1 - slRR / 100);
          newTP = entryPrice * (1 + nextTpRR / 100);
        } else {
          newSL = entryPrice * (1 + slRR / 100);
          newTP = entryPrice * (1 - nextTpRR / 100);
        }
        
        // Set SL if missing
        if (!hasSL) {
          try {
            const slAlgoId = await setAlgoOrder(
              symbol,
              side,
              dbPos.quantity,
              newSL,
              "sl",
              apiKey,
              apiSecret,
              passphrase,
              demo
            );
            
            if (slAlgoId) {
              console.log(`   ✅ SL FIXED @ ${newSL.toFixed(4)} - Algo: ${slAlgoId}`);
              slTpFixed++;
              details.push({
                symbol,
                side,
                action: "sl_fixed",
                reason: `SL set @ ${newSL.toFixed(4)}`
              });
            } else {
              const errMsg = `Failed to set SL for ${symbol} - API returned null`;
              console.error(`   ❌ ${errMsg}`);
              errors.push(errMsg);
            }
          } catch (error: any) {
            const errMsg = `Failed to set SL for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
        
        // Set TP if missing
        if (!hasTP) {
          try {
            const tpAlgoId = await setAlgoOrder(
              symbol,
              side,
              dbPos.quantity,
              newTP,
              "tp",
              apiKey,
              apiSecret,
              passphrase,
              demo
            );
            
            if (tpAlgoId) {
              console.log(`   ✅ TP FIXED @ ${newTP.toFixed(4)} - Algo: ${tpAlgoId}`);
              slTpFixed++;
              details.push({
                symbol,
                side,
                action: "tp_fixed",
                reason: `TP set @ ${newTP.toFixed(4)}`
              });
            } else {
              const errMsg = `Failed to set TP for ${symbol} - API returned null`;
              console.error(`   ❌ ${errMsg}`);
              errors.push(errMsg);
            }
          } catch (error: any) {
            const errMsg = `Failed to set TP for ${symbol}: ${error.message}`;
            console.error(`   ❌ ${errMsg}`);
            errors.push(errMsg);
          }
        }
      } else {
        console.log(`   ✅ Position has both SL and TP - OK`);
      }
    }

    console.log(`\n✅ [MONITOR] Completed - TP Hits: ${tpHits}, SL Adj: ${slAdjustments}, Fixed: ${slTpFixed}`);
    if (errors.length > 0) {
      console.error(`⚠️ [MONITOR] Errors encountered: ${errors.length}`);
    }

    return {
      success: true,
      checked: dbPositions.length,
      tpHits,
      slAdjustments,
      slTpFixed,
      errors,
      details,
    };

  } catch (error: any) {
    console.error("❌ [MONITOR] Fatal error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}