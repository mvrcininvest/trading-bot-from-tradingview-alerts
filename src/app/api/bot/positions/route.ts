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
    // 🔥 CRITICAL FIX: FETCH LIVE PNL FROM OKX
    // ============================================
    
    // Get bot settings for API credentials
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length > 0 && settings[0].apiKey && settings[0].apiSecret && settings[0].passphrase) {
      const botConfig = settings[0];
      const demo = botConfig.environment === "demo";
      
      try {
        // Fetch live positions from OKX
        const okxPositions = await getOkxPositions(
          botConfig.apiKey,
          botConfig.apiSecret,
          botConfig.passphrase,
          demo
        );
        
        // Create map for quick lookup: "SYMBOL_SIDE" -> OKX position
        const okxPositionsMap = new Map(
          okxPositions.map((p: any) => {
            const okxSymbol = p.instId;
            const positionSide = parseFloat(p.pos) > 0 ? "BUY" : "SELL";
            return [`${okxSymbol}_${positionSide}`, p];
          })
        );
        
        // Update each position with live PnL from OKX
        const updatedPositions = positions.map(pos => {
          const okxSymbol = convertSymbolToOkx(pos.symbol);
          const posKey = `${okxSymbol}_${pos.side}`;
          const okxPos = okxPositionsMap.get(posKey) as any;
          
          if (okxPos) {
            // Use live PnL from OKX
            const livePnl = parseFloat(okxPos.upl || "0");
            return {
              ...pos,
              unrealisedPnl: livePnl,
            };
          }
          
          // Position not found on OKX - keep DB value
          return pos;
        });
        
        return NextResponse.json(
          {
            success: true,
            positions: updatedPositions,
            count: updatedPositions.length,
            livePnlEnabled: true,
          },
          { status: 200 }
        );
      } catch (error) {
        console.error("Failed to fetch live PnL from OKX:", error);
        // If OKX fetch fails, return positions with DB PnL
      }
    }
    
    // Fallback: return positions without live PnL
    return NextResponse.json(
      {
        success: true,
        positions,
        count: positions.length,
        livePnlEnabled: false,
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