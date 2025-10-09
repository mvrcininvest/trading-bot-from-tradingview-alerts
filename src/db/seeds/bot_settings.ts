import { db } from '@/db';
import { botSettings } from '@/db/schema';

async function main() {
    const defaultBotSettings = [
        {
            botEnabled: false,
            positionSizeMode: 'percent',
            positionSizePercent: 2.0,
            positionSizeFixed: 100.0,
            leverageMode: 'from_alert',
            leverageFixed: 10,
            tierFilteringMode: 'all',
            disabledTiers: '[]',
            tpStrategy: 'multiple',
            maxConcurrentPositions: 10,
            sameSymbolBehavior: 'track_confirmations',
            oppositeDirectionStrategy: 'market_reversal',
            reversalWaitBars: 1,
            reversalMinStrength: 0.25,
            emergencyCanReverse: true,
            emergencyOverrideMode: 'only_profit',
            emergencyMinProfitPercent: 0.0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
    ];

    await db.insert(botSettings).values(defaultBotSettings);
    
    console.log('✅ Bot settings seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});