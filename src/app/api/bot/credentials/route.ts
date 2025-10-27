import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const VALID_EXCHANGES = ['bybit', 'binance'];
const VALID_ENVIRONMENTS = ['demo', 'testnet', 'mainnet'];

export async function GET(request: NextRequest) {
  try {
    const settings = await db.select()
      .from(botSettings)
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json({
        success: true,
        credentials: {
          apiKey: '',
          apiSecret: '',
          exchange: 'bybit',
          environment: 'demo'
        }
      }, { status: 200 });
    }

    const record = settings[0];

    return NextResponse.json({
      success: true,
      credentials: {
        apiKey: record.apiKey ?? '',
        apiSecret: record.apiSecret ?? '',
        exchange: record.exchange ?? 'bybit',
        environment: record.environment ?? 'demo'
      }
    }, { status: 200 });
  } catch (error) {
    console.error('GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)),
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, apiSecret, exchange, environment } = body;

    if (exchange !== undefined && exchange !== '' && !VALID_EXCHANGES.includes(exchange)) {
      return NextResponse.json({
        success: false,
        error: `Invalid exchange. Must be one of: ${VALID_EXCHANGES.join(', ')}`,
        code: 'INVALID_EXCHANGE'
      }, { status: 400 });
    }

    if (environment !== undefined && environment !== '' && !VALID_ENVIRONMENTS.includes(environment)) {
      return NextResponse.json({
        success: false,
        error: `Invalid environment. Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`,
        code: 'INVALID_ENVIRONMENT'
      }, { status: 400 });
    }

    const existingSettings = await db.select()
      .from(botSettings)
      .limit(1);

    if (existingSettings.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Bot settings not found',
        code: 'SETTINGS_NOT_FOUND'
      }, { status: 404 });
    }

    const settingsId = existingSettings[0].id;

    const updateData: any = {
      updatedAt: new Date().toISOString()
    };

    if (apiKey !== undefined) {
      updateData.apiKey = apiKey === '' ? null : apiKey;
    }

    if (apiSecret !== undefined) {
      updateData.apiSecret = apiSecret === '' ? null : apiSecret;
    }

    if (exchange !== undefined && exchange !== '') {
      updateData.exchange = exchange;
    }

    if (environment !== undefined && environment !== '') {
      updateData.environment = environment;
    }

    await db.update(botSettings)
      .set(updateData)
      .where(eq(botSettings.id, settingsId));

    return NextResponse.json({
      success: true,
      message: 'API credentials updated successfully'
    }, { status: 200 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error: ' + (error instanceof Error ? error.message : String(error)),
      code: 'INTERNAL_ERROR'
    }, { status: 500 });
  }
}