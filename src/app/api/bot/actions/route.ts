import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botActions } from '@/db/schema';
import { eq, like, desc, and, gte, lte, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse and validate pagination parameters
    const limitParam = searchParams.get('limit') || '50';
    const offsetParam = searchParams.get('offset') || '0';
    
    const limit = parseInt(limitParam);
    const offset = parseInt(offsetParam);
    
    if (isNaN(limit) || limit <= 0) {
      return NextResponse.json({ 
        error: "Limit must be a positive integer",
        code: "INVALID_LIMIT" 
      }, { status: 400 });
    }
    
    if (limit > 200) {
      return NextResponse.json({ 
        error: "Limit cannot exceed 200",
        code: "LIMIT_EXCEEDED" 
      }, { status: 400 });
    }
    
    if (isNaN(offset) || offset < 0) {
      return NextResponse.json({ 
        error: "Offset must be a non-negative integer",
        code: "INVALID_OFFSET" 
      }, { status: 400 });
    }
    
    // Parse filter parameters
    const actionType = searchParams.get('actionType');
    const symbol = searchParams.get('symbol');
    const successParam = searchParams.get('success');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    // Validate success parameter if provided
    if (successParam !== null && successParam !== 'true' && successParam !== 'false') {
      return NextResponse.json({ 
        error: "Success parameter must be 'true' or 'false'",
        code: "INVALID_SUCCESS_PARAM" 
      }, { status: 400 });
    }
    
    // Validate date parameters if provided
    if (startDate) {
      const startDateObj = new Date(startDate);
      if (isNaN(startDateObj.getTime())) {
        return NextResponse.json({ 
          error: "Invalid startDate format. Use ISO date format",
          code: "INVALID_START_DATE" 
        }, { status: 400 });
      }
    }
    
    if (endDate) {
      const endDateObj = new Date(endDate);
      if (isNaN(endDateObj.getTime())) {
        return NextResponse.json({ 
          error: "Invalid endDate format. Use ISO date format",
          code: "INVALID_END_DATE" 
        }, { status: 400 });
      }
    }
    
    // Build filter conditions
    const conditions = [];
    
    if (actionType) {
      conditions.push(eq(botActions.actionType, actionType));
    }
    
    if (symbol) {
      conditions.push(like(botActions.symbol, `%${symbol}%`));
    }
    
    if (successParam !== null) {
      const successValue = successParam === 'true';
      conditions.push(eq(botActions.success, successValue));
    }
    
    if (startDate) {
      conditions.push(gte(botActions.createdAt, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(botActions.createdAt, endDate));
    }
    
    // Build query with filters
    let query = db.select().from(botActions);
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(botActions);
    
    if (conditions.length > 0) {
      const whereCondition = and(...conditions);
      query = query.where(whereCondition);
      countQuery = countQuery.where(whereCondition);
    }
    
    // Get total count
    const totalResult = await countQuery;
    const total = totalResult[0]?.count || 0;
    
    // Get paginated results ordered by createdAt DESC
    const actions = await query
      .orderBy(desc(botActions.createdAt))
      .limit(limit)
      .offset(offset);
    
    return NextResponse.json({
      success: true,
      actions,
      total,
      limit,
      offset
    }, { status: 200 });
    
  } catch (error) {
    console.error('GET bot actions error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}