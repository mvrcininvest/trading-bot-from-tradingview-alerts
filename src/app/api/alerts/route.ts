import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { alerts } from '@/db/schema';
import { desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse and validate pagination parameters
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    
    let limit = 50; // default
    let offset = 0; // default
    
    if (limitParam) {
      const parsedLimit = parseInt(limitParam);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json({
          error: "Limit must be a positive integer",
          code: "INVALID_LIMIT"
        }, { status: 400 });
      }
      limit = Math.min(parsedLimit, 500); // max 500
    }
    
    if (offsetParam) {
      const parsedOffset = parseInt(offsetParam);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return NextResponse.json({
          error: "Offset must be a non-negative integer",
          code: "INVALID_OFFSET"
        }, { status: 400 });
      }
      offset = parsedOffset;
    }

    // Get total count
    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(alerts);
    const total = totalResult[0].count;

    // Get alerts with pagination and ordering
    const alertsResult = await db.select()
      .from(alerts)
      .orderBy(desc(alerts.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      success: true,
      alerts: alertsResult,
      total,
      limit,
      offset
    });

  } catch (error) {
    console.error('GET alerts error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + error
    }, { status: 500 });
  }
}