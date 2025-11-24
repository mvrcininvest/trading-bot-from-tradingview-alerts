import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botPositions, botSettings } from '@/db/schema';
import { eq, like, desc, and, or } from 'drizzle-orm';
import { getBybitPositions, convertSymbolToBybit } from '@/lib/bybit-helpers';

// ============================================
// 🎯 HELPER: EXTRACT SL/TP FROM BYBIT POSITIONS
// ============================================

function extractSlTpFromBybitPositions(
  bybitPositions: any[],
  positions: any[]
): Map<number, {
  liveSlPrice: number | null;
  liveTp1Price: number | null;
  liveTp2Price: number | null;
  liveTp3Price: number | null;
}> {
  const positionOrdersMap = new Map();

  console.log(`\n🗺️ [API /positions] Extracting SL/TP from ${bybitPositions.length} Bybit positions...`);

  for (const pos of positions) {
    const bybitSymbol = convertSymbolToBybit(pos.symbol);
    
    // Find matching Bybit position
    const bybitPos = bybitPositions.find((bp: any) => 
      bp.symbol === bybitSymbol && 
      bp.side === pos.side
    );

    if (!bybitPos) {
      console.log(`  ⚠️ [${pos.symbol}] No matching Bybit position found`);
      continue;
    }

    console.log(`  📊 [${pos.symbol}] Bybit position data:`, {
      stopLoss: bybitPos.stopLoss,
      takeProfit: bybitPos.takeProfit,
      tpslMode: bybitPos.tpslMode
    });

    // Extract SL and TP from position object
    const liveSlPrice = bybitPos.stopLoss && parseFloat(bybitPos.stopLoss) > 0 
      ? parseFloat(bybitPos.stopLoss) 
      : null;
    
    const liveTpPrice = bybitPos.takeProfit && parseFloat(bybitPos.takeProfit) > 0 
      ? parseFloat(bybitPos.takeProfit) 
      : null;

    const result = {
      liveSlPrice,
      liveTp1Price: liveTpPrice, // In Bybit V5, there's typically one TP set
      liveTp2Price: null,        // Multiple TPs would be in separate orders
      liveTp3Price: null,
    };

    console.log(`  ✅ [${pos.symbol}] Extracted SL/TP:`, result);

    positionOrdersMap.set(pos.id, result);
  }

  console.log(`✅ [API /positions] Extraction complete\n`);
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
          console.log(`\n🚀 [API /positions] Fetching live positions from Bybit...`);
          
          // Fetch live positions from Bybit
          const bybitPositions = await getBybitPositions(apiKey, apiSecret);
          
          console.log(`📊 [API /positions] Bybit Results: ${bybitPositions.length} positions`);
          
          // Create map for quick lookup: "SYMBOL_SIDE" -> Bybit position
          const bybitPositionsMap = new Map(
            bybitPositions.map((p: any) => {
              const bybitSymbol = p.symbol;
              const positionSide = p.side === "Buy" ? "Buy" : "Sell";
              return [`${bybitSymbol}_${positionSide}`, p];
            })
          );
          
          console.log(`🗺️ [API /positions] Created position map with ${bybitPositionsMap.size} entries`);
          
          // Extract SL/TP directly from Bybit positions
          const positionSlTpMap = extractSlTpFromBybitPositions(bybitPositions, positions);
          
          // Update each position with live PnL and SL/TP from Bybit
          const updatedPositions = positions.map(pos => {
            const bybitSymbol = convertSymbolToBybit(pos.symbol);
            const posKey = `${bybitSymbol}_${pos.side}`;
            const bybitPos = bybitPositionsMap.get(posKey) as any;
            const slTpData = positionSlTpMap.get(pos.id);
            
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
            if (slTpData) {
              console.log(`✅ [${pos.symbol} ${pos.side}] Live SL/TP:`, {
                SL: slTpData.liveSlPrice,
                TP1: slTpData.liveTp1Price,
                TP2: slTpData.liveTp2Price,
                TP3: slTpData.liveTp3Price
              });
              
              return {
                ...updatedPos,
                liveSlPrice: slTpData.liveSlPrice,
                liveTp1Price: slTpData.liveTp1Price,
                liveTp2Price: slTpData.liveTp2Price,
                liveTp3Price: slTpData.liveTp3Price,
              };
            } else {
              console.log(`⚠️ [${pos.symbol} ${pos.side}] No SL/TP data extracted`);
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