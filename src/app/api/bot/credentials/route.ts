import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const VALID_EXCHANGES = ['bybit'];
const VALID_ENVIRONMENTS = ['mainnet'];

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
          environment: 'mainnet'
        }
      }, { status: 200 });
    }

    const record = settings[0];

    return NextResponse.json({
      success: true,
      credentials: {
        apiKey: record.apiKey ?? '',
        apiSecret: record.apiSecret ?? '',
        exchange: 'bybit',
        environment: 'mainnet'
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
        error: `Invalid exchange. Only Bybit mainnet is supported.`,
        code: 'INVALID_EXCHANGE'
      }, { status: 400 });
    }

    if (environment !== undefined && environment !== '' && !VALID_ENVIRONMENTS.includes(environment)) {
      return NextResponse.json({
        success: false,
        error: `Invalid environment. Only mainnet is supported.`,
        code: 'INVALID_ENVIRONMENT'
      }, { status: 400 });
    }

    const existingSettings = await db.select()
      .from(botSettings)
      .limit(1);

    if (existingSettings.length === 0) {
      console.log('⚠️ No botSettings found, creating new record...');
      
      await db.insert(botSettings).values({
        botEnabled: false,
        apiKey: apiKey || null,
        apiSecret: apiSecret || null,
        passphrase: null,
        exchange: 'bybit',
        environment: 'mainnet',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      console.log('✅ New botSettings record created with API credentials');

      return NextResponse.json({
        success: true,
        message: 'API credentials saved successfully (new record created)'
      }, { status: 200 });
    }

    const settingsId = existingSettings[0].id;

    const updateData: any = {
      updatedAt: new Date().toISOString(),
      exchange: 'bybit',
      environment: 'mainnet',
      passphrase: null
    };

    if (apiKey !== undefined) {
      updateData.apiKey = apiKey === '' ? null : apiKey;
    }

    if (apiSecret !== undefined) {
      updateData.apiSecret = apiSecret === '' ? null : apiSecret;
    }

    await db.update(botSettings)
      .set(updateData)
      .where(eq(botSettings.id, settingsId));

    console.log('✅ API credentials updated successfully');

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