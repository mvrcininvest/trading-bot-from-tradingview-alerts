import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botPositions } from '@/db/schema';
import { eq, like, desc, and, or } from 'drizzle-orm';

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

    return NextResponse.json(
      {
        success: true,
        positions,
        count: positions.length
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