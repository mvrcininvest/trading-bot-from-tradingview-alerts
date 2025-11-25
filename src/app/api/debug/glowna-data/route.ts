import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { botSettings, botPositions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    // 1. Pobierz surowe dane z bot_settings
    const rawSettings = await db.select().from(botSettings).limit(1);
    
    // 2. Pobierz wszystkie pozycje (bez filtrowania)
    const allPositions = await db.select().from(botPositions);
    
    // 3. Zlicz pozycje według statusu
    const positionsByStatus = allPositions.reduce((acc: any, pos) => {
      acc[pos.status] = (acc[pos.status] || 0) + 1;
      return acc;
    }, {});
    
    // 4. Znajdź pozycje ze statusem 'open'
    const openPositions = allPositions.filter(p => p.status === 'open');
    
    return NextResponse.json({
      success: true,
      diagnostics: {
        // Surowe dane z bazy
        rawSettings: rawSettings[0] || null,
        
        // Status bota
        botEnabled: {
          rawValue: rawSettings[0]?.botEnabled,
          type: typeof rawSettings[0]?.botEnabled,
          asBoolean: !!rawSettings[0]?.botEnabled,
          asNumber: Number(rawSettings[0]?.botEnabled),
        },
        
        // Credentials
        credentials: {
          hasApiKey: !!rawSettings[0]?.apiKey,
          hasApiSecret: !!rawSettings[0]?.apiSecret,
          apiKeyLength: rawSettings[0]?.apiKey?.length || 0,
          apiSecretLength: rawSettings[0]?.apiSecret?.length || 0,
          exchange: rawSettings[0]?.exchange,
          environment: rawSettings[0]?.environment,
        },
        
        // Pozycje
        positions: {
          total: allPositions.length,
          byStatus: positionsByStatus,
          openPositions: openPositions.length,
          openPositionsDetails: openPositions.map(p => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            status: p.status,
            openedAt: p.openedAt,
            unrealisedPnl: p.unrealisedPnl,
          })),
        },
        
        // Test połączenia z Bybit
        bybitTest: null, // Będzie wypełnione poniżej
      },
    }, { status: 200 });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, { status: 500 });
  }
}
