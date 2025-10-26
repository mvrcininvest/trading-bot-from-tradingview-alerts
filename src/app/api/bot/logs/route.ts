import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botLogs } from '@/db/schema';
import { eq, gte, lte, desc, and, or, sql } from 'drizzle-orm';

const VALID_LEVELS = ['error', 'warning', 'info', 'success'] as const;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse and validate limit
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : DEFAULT_LIMIT;
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json({
        error: 'Limit must be a positive integer',
        code: 'INVALID_LIMIT'
      }, { status: 400 });
    }
    if (limit > MAX_LIMIT) {
      return NextResponse.json({
        error: `Limit cannot exceed ${MAX_LIMIT}`,
        code: 'LIMIT_EXCEEDED'
      }, { status: 400 });
    }

    // Parse and validate offset
    const offsetParam = searchParams.get('offset');
    const offset = offsetParam ? parseInt(offsetParam) : 0;
    if (isNaN(offset) || offset < 0) {
      return NextResponse.json({
        error: 'Offset must be a non-negative integer',
        code: 'INVALID_OFFSET'
      }, { status: 400 });
    }

    // Parse and validate level
    const level = searchParams.get('level');
    if (level && !VALID_LEVELS.includes(level as any)) {
      return NextResponse.json({
        error: `Level must be one of: ${VALID_LEVELS.join(', ')}`,
        code: 'INVALID_LEVEL'
      }, { status: 400 });
    }

    // Parse and validate action
    const action = searchParams.get('action');

    // Parse and validate timestamps
    const startTimestampParam = searchParams.get('startTimestamp');
    const startTimestamp = startTimestampParam ? parseInt(startTimestampParam) : null;
    if (startTimestampParam && (isNaN(startTimestamp!) || startTimestamp! < 0)) {
      return NextResponse.json({
        error: 'Start timestamp must be a valid positive integer',
        code: 'INVALID_START_TIMESTAMP'
      }, { status: 400 });
    }

    const endTimestampParam = searchParams.get('endTimestamp');
    const endTimestamp = endTimestampParam ? parseInt(endTimestampParam) : null;
    if (endTimestampParam && (isNaN(endTimestamp!) || endTimestamp! < 0)) {
      return NextResponse.json({
        error: 'End timestamp must be a valid positive integer',
        code: 'INVALID_END_TIMESTAMP'
      }, { status: 400 });
    }

    // Parse and validate alertId
    const alertIdParam = searchParams.get('alertId');
    const alertId = alertIdParam ? parseInt(alertIdParam) : null;
    if (alertIdParam && (isNaN(alertId!) || alertId! < 1)) {
      return NextResponse.json({
        error: 'Alert ID must be a valid positive integer',
        code: 'INVALID_ALERT_ID'
      }, { status: 400 });
    }

    // Parse and validate positionId
    const positionIdParam = searchParams.get('positionId');
    const positionId = positionIdParam ? parseInt(positionIdParam) : null;
    if (positionIdParam && (isNaN(positionId!) || positionId! < 1)) {
      return NextResponse.json({
        error: 'Position ID must be a valid positive integer',
        code: 'INVALID_POSITION_ID'
      }, { status: 400 });
    }

    // Build WHERE conditions
    const conditions = [];
    
    if (level) {
      conditions.push(eq(botLogs.level, level));
    }
    
    if (action) {
      conditions.push(eq(botLogs.action, action));
    }
    
    if (startTimestamp !== null) {
      conditions.push(gte(botLogs.timestamp, startTimestamp));
    }
    
    if (endTimestamp !== null) {
      conditions.push(lte(botLogs.timestamp, endTimestamp));
    }
    
    if (alertId !== null) {
      conditions.push(eq(botLogs.alertId, alertId));
    }
    
    if (positionId !== null) {
      conditions.push(eq(botLogs.positionId, positionId));
    }

    // Build WHERE condition
    const whereCondition = conditions.length > 0 
      ? (conditions.length === 1 ? conditions[0] : and(...conditions))
      : undefined;

    // Execute queries with conditional where clause
    const logs = whereCondition
      ? await db.select()
          .from(botLogs)
          .where(whereCondition)
          .orderBy(desc(botLogs.timestamp))
          .limit(limit)
          .offset(offset)
      : await db.select()
          .from(botLogs)
          .orderBy(desc(botLogs.timestamp))
          .limit(limit)
          .offset(offset);

    const totalResult = whereCondition
      ? await db.select({ count: sql<number>`count(*)` })
          .from(botLogs)
          .where(whereCondition)
      : await db.select({ count: sql<number>`count(*)` })
          .from(botLogs);

    const total = totalResult[0]?.count || 0;

    return NextResponse.json({
      success: true,
      logs,
      total,
      limit,
      offset
    }, { status: 200 });

  } catch (error) {
    console.error('GET bot_logs error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + error
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const { timestamp, level, action, message, createdAt } = body;

    if (timestamp === undefined || timestamp === null) {
      return NextResponse.json({
        error: 'Timestamp is required',
        code: 'MISSING_TIMESTAMP'
      }, { status: 400 });
    }

    if (!level) {
      return NextResponse.json({
        error: 'Level is required',
        code: 'MISSING_LEVEL'
      }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({
        error: 'Action is required',
        code: 'MISSING_ACTION'
      }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({
        error: 'Message is required',
        code: 'MISSING_MESSAGE'
      }, { status: 400 });
    }

    if (createdAt === undefined || createdAt === null) {
      return NextResponse.json({
        error: 'CreatedAt is required',
        code: 'MISSING_CREATED_AT'
      }, { status: 400 });
    }

    // Validate level
    if (!VALID_LEVELS.includes(level as any)) {
      return NextResponse.json({
        error: `Level must be one of: ${VALID_LEVELS.join(', ')}`,
        code: 'INVALID_LEVEL'
      }, { status: 400 });
    }

    // Validate timestamp is valid integer
    if (!Number.isInteger(timestamp) || timestamp < 0) {
      return NextResponse.json({
        error: 'Timestamp must be a valid positive integer',
        code: 'INVALID_TIMESTAMP'
      }, { status: 400 });
    }

    // Validate createdAt is valid integer
    if (!Number.isInteger(createdAt) || createdAt < 0) {
      return NextResponse.json({
        error: 'CreatedAt must be a valid positive integer',
        code: 'INVALID_CREATED_AT'
      }, { status: 400 });
    }

    // Validate message is non-empty string
    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({
        error: 'Message must be a non-empty string',
        code: 'INVALID_MESSAGE'
      }, { status: 400 });
    }

    // Validate optional alertId
    const { alertId, positionId, details } = body;
    
    if (alertId !== undefined && alertId !== null) {
      if (!Number.isInteger(alertId) || alertId < 1) {
        return NextResponse.json({
          error: 'Alert ID must be a valid positive integer',
          code: 'INVALID_ALERT_ID'
        }, { status: 400 });
      }
    }

    // Validate optional positionId
    if (positionId !== undefined && positionId !== null) {
      if (!Number.isInteger(positionId) || positionId < 1) {
        return NextResponse.json({
          error: 'Position ID must be a valid positive integer',
          code: 'INVALID_POSITION_ID'
        }, { status: 400 });
      }
    }

    // Prepare log data
    const logData: any = {
      timestamp,
      level,
      action,
      message: message.trim(),
      createdAt
    };

    // Add optional fields
    if (details !== undefined && details !== null) {
      logData.details = details;
    }

    if (alertId !== undefined && alertId !== null) {
      logData.alertId = alertId;
    }

    if (positionId !== undefined && positionId !== null) {
      logData.positionId = positionId;
    }

    // Insert log
    const newLog = await db.insert(botLogs)
      .values(logData)
      .returning();

    return NextResponse.json(newLog[0], { status: 201 });

  } catch (error) {
    console.error('POST bot_logs error:', error);
    return NextResponse.json({
      error: 'Internal server error: ' + error
    }, { status: 500 });
  }
}