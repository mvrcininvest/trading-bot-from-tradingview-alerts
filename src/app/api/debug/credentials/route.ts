import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings } from '@/db/schema';

/**
 * DEBUG ENDPOINT - Porównaj klucze z localStorage vs baza danych
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { localStorageKeys } = body;

    // Pobierz klucze z bazy danych
    const dbSettings = await db.select().from(botSettings).limit(1);
    
    const dbData = dbSettings.length > 0 ? {
      exchange: dbSettings[0].exchange,
      environment: dbSettings[0].environment,
      apiKey: dbSettings[0].apiKey,
      apiKeyPreview: dbSettings[0].apiKey ? `${dbSettings[0].apiKey.substring(0, 8)}...${dbSettings[0].apiKey.slice(-4)}` : 'BRAK',
      apiSecretPreview: dbSettings[0].apiSecret ? `${dbSettings[0].apiSecret.substring(0, 8)}...${dbSettings[0].apiSecret.slice(-4)}` : 'BRAK',
      hasApiKey: !!dbSettings[0].apiKey,
      hasApiSecret: !!dbSettings[0].apiSecret,
    } : null;

    const localData = localStorageKeys ? {
      exchange: localStorageKeys.exchange,
      environment: localStorageKeys.environment,
      apiKeyPreview: localStorageKeys.apiKey ? `${localStorageKeys.apiKey.substring(0, 8)}...${localStorageKeys.apiKey.slice(-4)}` : 'BRAK',
      apiSecretPreview: localStorageKeys.apiSecret ? `${localStorageKeys.apiSecret.substring(0, 8)}...${localStorageKeys.apiSecret.slice(-4)}` : 'BRAK',
      hasApiKey: !!localStorageKeys.apiKey,
      hasApiSecret: !!localStorageKeys.apiSecret,
    } : null;

    // Porównaj klucze
    const comparison = {
      sameApiKey: localStorageKeys?.apiKey === dbData?.apiKey,
      sameEnvironment: localStorageKeys?.environment === dbData?.environment,
      sameExchange: localStorageKeys?.exchange === dbData?.exchange,
    };

    return NextResponse.json({
      success: true,
      localStorage: localData,
      database: dbData,
      comparison,
      diagnosis: {
        dashboardUses: 'localStorage',
        webhookUses: 'database',
        problem: !comparison.sameApiKey 
          ? '❌ KLUCZE API SĄ RÓŻNE! Dashboard używa innych kluczy niż webhook!'
          : !comparison.sameEnvironment
          ? `❌ ENVIRONMENT JEST RÓŻNY! Dashboard: ${localStorageKeys?.environment}, Webhook: ${dbData?.environment}`
          : !comparison.sameExchange
          ? '❌ EXCHANGE JEST RÓŻNY!'
          : '✅ Klucze są identyczne - problem gdzie indziej',
      }
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
