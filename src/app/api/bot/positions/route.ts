import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botPositions, botSettings } from '@/db/schema';
import { eq, like, desc, and, or } from 'drizzle-orm';
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
// 🏦 GET LIVE POSITIONS FROM OKX
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
    console.error("OKX API error:", data);
    return [];
  }

  // Return only positions with pos !== 0
  return data.data?.filter((p: any) => parseFloat(p.pos) !== 0) || [];
}

// ============================================
// 🏦 GET ALGO ORDERS FROM OKX (SL/TP)
// ============================================

async function getOkxAlgoOrders(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  demo: boolean
) {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/trade/orders-algo-pending";
  const queryString = "?ordType=conditional";
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
    console.error("OKX API error (algo orders):", data);
    return [];
  }

  return data.data || [];
}

// ============================================
// 🎯 HELPER: MAP ALGO ORDERS TO POSITIONS
// ============================================

function mapAlgoOrdersToPositions(
  okxAlgoOrders: any[],
  positions: any[]
): Map<number, {
  liveSlPrice: number | null;
  liveTp1Price: number | null;
  liveTp2Price: number | null;
  liveTp3Price: number | null;
}> {
  const positionOrdersMap = new Map();

  for (const pos of positions) {
    const okxSymbol = convertSymbolToOkx(pos.symbol);
    const positionSide = pos.side === 'BUY' ? 'long' : 'short';
    
    // Filter orders for this symbol and side
    const relevantOrders = okxAlgoOrders.filter((order: any) => {
      return order.instId === okxSymbol && order.posSide === positionSide;
    });

    let liveSlPrice: number | null = null;
    const tpPrices: number[] = [];

    // Extract SL and TP prices
    for (const order of relevantOrders) {
      // Stop Loss
      if (order.slTriggerPx && parseFloat(order.slTriggerPx) > 0) {
        liveSlPrice = parseFloat(order.slTriggerPx);
      }
      
      // Take Profit
      if (order.tpTriggerPx && parseFloat(order.tpTriggerPx) > 0) {
        tpPrices.push(parseFloat(order.tpTriggerPx));
      }
    }

    // Sort TP prices (closest to entry price = TP1, farthest = TP3)
    // For BUY (long): TP1 < TP2 < TP3 (ascending)
    // For SELL (short): TP1 > TP2 > TP3 (descending)
    const entryPrice = pos.entryPrice;
    
    if (pos.side === 'BUY') {
      // Long: TP prices above entry, sort ascending
      tpPrices.sort((a, b) => a - b);
    } else {
      // Short: TP prices below entry, sort descending
      tpPrices.sort((a, b) => b - a);
    }

    positionOrdersMap.set(pos.id, {
      liveSlPrice,
      liveTp1Price: tpPrices[0] || null,
      liveTp2Price: tpPrices[1] || null,
      liveTp3Price: tpPrices[2] || null,
    });
  }

  return positionOrdersMap;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const side = searchParams.get('side');
    const tier = searchParams.get('tier');
    const status = searchParams.get('status');

    // Build WHERE conditions
    const conditions = [];

    // Default: return 'open' and 'partial_close' positions
    if (status) {
      conditions.push(eq(botPositions.status, status));
    } else {
      conditions.push(
        or(
          eq(botPositions.status, 'open'),
          eq(botPositions.status, 'partial_close')
        )
      );
    }

    // Add symbol filter (case-insensitive partial match)
    if (symbol) {
      conditions.push(like(botPositions.symbol, `%${symbol}%`));
    }

    // Add side filter (exact match)
    if (side) {
      if (side !== 'Buy' && side !== 'Sell') {
        return NextResponse.json(
          {
            error: 'Invalid side parameter. Must be "Buy" or "Sell"',
            code: 'INVALID_SIDE'
          },
          { status: 400 }
        );
      }
      conditions.push(eq(botPositions.side, side));
    }

    // Add tier filter (exact match)
    if (tier) {
      conditions.push(eq(botPositions.tier, tier));
    }

    // Execute query with filters and ordering
    const positions = await db
      .select()
      .from(botPositions)
      .where(and(...conditions))
      .orderBy(desc(botPositions.openedAt));

    // ============================================
    // 🔥 CRITICAL FIX: FETCH LIVE PNL AND SL/TP FROM OKX
    // ============================================
    
    // Get bot settings for API credentials
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length > 0) {
      const botConfig = settings[0];
      const { apiKey, apiSecret, passphrase } = botConfig;
      
      // ✅ Type-safe check: ensure all credentials exist
      if (apiKey && apiSecret && passphrase) {
        const demo = botConfig.environment === "demo";
        
        try {
          // Fetch live positions and algo orders from OKX in parallel
          const [okxPositions, okxAlgoOrders] = await Promise.all([
            getOkxPositions(apiKey, apiSecret, passphrase, demo),
            getOkxAlgoOrders(apiKey, apiSecret, passphrase, demo)
          ]);
          
          console.log(`📊 [API /positions] Fetched ${okxAlgoOrders.length} algo orders from OKX`);
          
          // Create map for quick lookup: "SYMBOL_SIDE" -> OKX position
          const okxPositionsMap = new Map(
            okxPositions.map((p: any) => {
              const okxSymbol = p.instId;
              const positionSide = parseFloat(p.pos) > 0 ? "BUY" : "SELL";
              return [`${okxSymbol}_${positionSide}`, p];
            })
          );
          
          // ✅ IMPROVED: Map algo orders to positions with correct side filtering and sorting
          const positionOrdersMap = mapAlgoOrdersToPositions(okxAlgoOrders, positions);
          
          // Update each position with live PnL and SL/TP from OKX
          const updatedPositions = positions.map(pos => {
            const okxSymbol = convertSymbolToOkx(pos.symbol);
            const posKey = `${okxSymbol}_${pos.side}`;
            const okxPos = okxPositionsMap.get(posKey) as any;
            const algoOrders = positionOrdersMap.get(pos.id);
            
            let updatedPos = { ...pos };
            
            // Update live PnL
            if (okxPos) {
              const livePnl = parseFloat(okxPos.upl || "0");
              updatedPos.unrealisedPnl = livePnl;
            }
            
            // Update live SL/TP
            if (algoOrders) {
              console.log(`✅ [${pos.symbol} ${pos.side}] Mapped orders: SL=${algoOrders.liveSlPrice}, TP1=${algoOrders.liveTp1Price}, TP2=${algoOrders.liveTp2Price}, TP3=${algoOrders.liveTp3Price}`);
              
              return {
                ...updatedPos,
                liveSlPrice: algoOrders.liveSlPrice,
                liveTp1Price: algoOrders.liveTp1Price,
                liveTp2Price: algoOrders.liveTp2Price,
                liveTp3Price: algoOrders.liveTp3Price,
              };
            } else {
              console.log(`⚠️ [${pos.symbol} ${pos.side}] No algo orders found`);
            }
            
            return updatedPos;
          });
          
          return NextResponse.json(
            {
              success: true,
              positions: updatedPositions,
              count: updatedPositions.length,
              livePnlEnabled: true,
              liveSlTpEnabled: true,
            },
            { status: 200 }
          );
        } catch (error) {
          console.error("Failed to fetch live data from OKX:", error);
          // If OKX fetch fails, return positions with DB values
        }
      }
    }
    
    // Fallback: return positions without live data
    return NextResponse.json(
      {
        success: true,
        positions,
        count: positions.length,
        livePnlEnabled: false,
        liveSlTpEnabled: false,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + error
      },
      { status: 500 }
    );
  }
}