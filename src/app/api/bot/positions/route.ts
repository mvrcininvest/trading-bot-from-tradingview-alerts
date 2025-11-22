import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botPositions, botSettings } from '@/db/schema';
import { eq, like, desc, and, or } from 'drizzle-orm';
import { getBybitPositions, getBybitAlgoOrders, convertSymbolToBybit } from '@/lib/bybit-helpers';

// ============================================
// 🎯 HELPER: MAP ALGO ORDERS TO POSITIONS
// ============================================

function mapAlgoOrdersToPositions(
  bybitAlgoOrders: any[],
  positions: any[]
): Map<number, {
  liveSlPrice: number | null;
  liveTp1Price: number | null;
  liveTp2Price: number | null;
  liveTp3Price: number | null;
}> {
  const positionOrdersMap = new Map();

  console.log(`\n🗺️ [API /positions] Mapping algo orders to ${positions.length} positions...`);

  for (const pos of positions) {
    const bybitSymbol = convertSymbolToBybit(pos.symbol);
    
    console.log(`  📊 [${pos.symbol}] Looking for orders: ${bybitSymbol}`);
    
    // Filter orders for this symbol
    const relevantOrders = bybitAlgoOrders.filter((order: any) => {
      const matchesSymbol = order.symbol === bybitSymbol;
      console.log(`    Order ${order.orderId}: symbol=${order.symbol}, side=${order.side}, matches=${matchesSymbol}`);
      return matchesSymbol;
    });

    console.log(`  ✅ [${pos.symbol}] Found ${relevantOrders.length} relevant orders`);

    let liveSlPrice: number | null = null;
    const tpPrices: number[] = [];

    // Extract SL and TP prices from Bybit orders
    for (const order of relevantOrders) {
      console.log(`    Order details: stopLoss=${order.stopLoss}, takeProfit=${order.takeProfit}, qty=${order.qty}`);
      
      // Stop Loss
      if (order.stopLoss && parseFloat(order.stopLoss) > 0) {
        liveSlPrice = parseFloat(order.stopLoss);
        console.log(`    Found SL: ${liveSlPrice}`);
      }
      
      // Take Profit
      if (order.takeProfit && parseFloat(order.takeProfit) > 0) {
        const tpPrice = parseFloat(order.takeProfit);
        tpPrices.push(tpPrice);
        console.log(`    Found TP: ${tpPrice}`);
      }
    }

    // Sort TP prices (closest to entry price = TP1, farthest = TP3)
    const entryPrice = pos.entryPrice;
    
    if (pos.side === 'Buy') {
      // Long: TP prices above entry, sort ascending
      tpPrices.sort((a, b) => a - b);
    } else {
      // Short: TP prices below entry, sort descending
      tpPrices.sort((a, b) => b - a);
    }

    const result = {
      liveSlPrice,
      liveTp1Price: tpPrices[0] || null,
      liveTp2Price: tpPrices[1] || null,
      liveTp3Price: tpPrices[2] || null,
    };

    console.log(`  📋 [${pos.symbol}] Final mapping:`, result);

    positionOrdersMap.set(pos.id, result);
  }

  console.log(`✅ [API /positions] Mapping complete\n`);
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

    console.log(`\n📊 [API /positions] Found ${positions.length} positions in DB`);

    // ============================================
    // 🔥 FETCH LIVE PNL AND SL/TP FROM BYBIT
    // ============================================
    
    // Get bot settings for API credentials
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length > 0) {
      const botConfig = settings[0];
      const { apiKey, apiSecret } = botConfig;
      
      console.log(`🔑 [API /positions] Credentials check: apiKey=${!!apiKey}, apiSecret=${!!apiSecret}`);
      
      // Type-safe check: ensure all credentials exist
      if (apiKey && apiSecret) {
        console.log(`🌐 [API /positions] Environment: Bybit Mainnet`);
        
        try {
          console.log(`\n🚀 [API /positions] Starting parallel Bybit fetch...`);
          
          // Fetch live positions and algo orders from Bybit in parallel
          const [bybitPositions, bybitAlgoOrders] = await Promise.all([
            getBybitPositions(apiKey, apiSecret),
            getBybitAlgoOrders(apiKey, apiSecret)
          ]);
          
          console.log(`📊 [API /positions] Bybit Results: ${bybitPositions.length} positions, ${bybitAlgoOrders.length} algo orders`);
          
          // Create map for quick lookup: "SYMBOL_SIDE" -> Bybit position
          const bybitPositionsMap = new Map(
            bybitPositions.map((p: any) => {
              const bybitSymbol = p.symbol;
              const positionSide = p.side === "Buy" ? "Buy" : "Sell";
              return [`${bybitSymbol}_${positionSide}`, p];
            })
          );
          
          console.log(`🗺️ [API /positions] Created position map with ${bybitPositionsMap.size} entries`);
          
          // Map algo orders to positions
          const positionOrdersMap = mapAlgoOrdersToPositions(bybitAlgoOrders, positions);
          
          // Update each position with live PnL and SL/TP from Bybit
          const updatedPositions = positions.map(pos => {
            const bybitSymbol = convertSymbolToBybit(pos.symbol);
            const posKey = `${bybitSymbol}_${pos.side}`;
            const bybitPos = bybitPositionsMap.get(posKey) as any;
            const algoOrders = positionOrdersMap.get(pos.id);
            
            let updatedPos = { ...pos };
            
            // Update live PnL
            if (bybitPos) {
              const livePnl = parseFloat(bybitPos.unrealisedPnl || "0");
              updatedPos.unrealisedPnl = livePnl;
              console.log(`💰 [${pos.symbol}] Updated PnL: ${livePnl.toFixed(2)} USDT`);
            } else {
              console.log(`⚠️ [${pos.symbol}] No Bybit position found for ${posKey}`);
            }
            
            // Update live SL/TP
            if (algoOrders) {
              console.log(`✅ [${pos.symbol} ${pos.side}] Mapped orders:`, {
                SL: algoOrders.liveSlPrice,
                TP1: algoOrders.liveTp1Price,
                TP2: algoOrders.liveTp2Price,
                TP3: algoOrders.liveTp3Price
              });
              
              return {
                ...updatedPos,
                liveSlPrice: algoOrders.liveSlPrice,
                liveTp1Price: algoOrders.liveTp1Price,
                liveTp2Price: algoOrders.liveTp2Price,
                liveTp3Price: algoOrders.liveTp3Price,
              };
            } else {
              console.log(`⚠️ [${pos.symbol} ${pos.side}] No algo orders mapped`);
            }
            
            return updatedPos;
          });
          
          console.log(`\n✅ [API /positions] Successfully updated ${updatedPositions.length} positions with live data\n`);
          
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
          console.error("❌ [API /positions] Failed to fetch live data from Bybit:", error);
          // If Bybit fetch fails, return positions with DB values
        }
      } else {
        console.log(`⚠️ [API /positions] Missing credentials - returning DB values only`);
      }
    }
    
    // Fallback: return positions without live data
    console.log(`⚠️ [API /positions] Returning positions without live Bybit data\n`);
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
    console.error('❌ [API /positions] GET error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error: ' + error
      },
      { status: 500 }
    );
  }
}