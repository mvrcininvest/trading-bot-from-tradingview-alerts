import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';

export async function GET(request: NextRequest) {
  try {
    const settings = await db.select().from(botSettings).limit(1);

    if (settings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No bot settings found in database',
        data: null
      }, { status: 200 });
    }

    const record = settings[0];

    return NextResponse.json({
      success: true,
      message: 'Bot settings retrieved from database',
      data: {
        id: record.id,
        botEnabled: record.botEnabled,
        exchange: record.exchange,
        environment: record.environment,
        apiKeyPreview: record.apiKey ? `${record.apiKey.substring(0, 8)}...${record.apiKey.slice(-4)}` : 'NOT SET',
        apiSecretSet: !!record.apiSecret,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }
    }, { status: 200 });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}