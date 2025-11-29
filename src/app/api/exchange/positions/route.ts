import { NextRequest, NextResponse } from 'next/server';
import { getPositions } from '@/lib/bybit-client';
import { db } from '@/db';
import { botSettings } from '@/db/schema';

/**
 * GET /api/exchange/positions
 * Pobiera otwarte pozycje z Bybit (używa credentials z bazy)
 */
export async function GET(request: NextRequest) {
  try {
    console.log('\n📊 [Positions API] Fetching positions from Bybit...');

    // Get credentials from database
    const settings = await db.select()
      .from(botSettings)
      .limit(1);

    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing API credentials in database',
        },
        { status: 400 }
      );
    }

    const { apiKey, apiSecret } = settings[0];

    console.log(`   API Key: ${apiKey!.substring(0, 8)}...`);

    const result = await getPositions(apiKey!, apiSecret!);

    console.log('   ✅ Positions fetched successfully');

    // Filter only open positions (size > 0)
    const openPositions = result.list
      ?.filter((p: any) => parseFloat(p.size) > 0)
      .map((p: any) => ({
        symbol: p.symbol,
        side: p.side,
        size: p.size,
        entryPrice: p.avgPrice,
        markPrice: p.markPrice,
        leverage: p.leverage,
        unrealisedPnl: p.unrealisedPnl,
        takeProfit: p.takeProfit || '0',
        stopLoss: p.stopLoss || '0',
        positionValue: p.positionValue,
        liqPrice: p.liqPrice || '0',
      })) || [];

    console.log(`   📈 Open Positions: ${openPositions.length}\n`);

    return NextResponse.json({
      success: true,
      positions: openPositions,
      total: openPositions.length,
    });
  } catch (error: any) {
    console.error('❌ [Positions API] Error:', error.message);
    
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to fetch positions',
      },
      { status: 500 }
    );
  }
}
