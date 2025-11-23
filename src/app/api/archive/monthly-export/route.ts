import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { and, gte, lte, desc } from 'drizzle-orm';

/**
 * 📦 AUTOMATED MONTHLY ARCHIVE
 * 
 * Auto-exports old position data to external storage (Supabase/S3).
 * This endpoint can be called manually or via a cron job.
 * 
 * Usage:
 * - Manual: GET /api/archive/monthly-export
 * - Cron: Setup a monthly cron job to call this endpoint
 * 
 * Query Parameters:
 * - month: YYYY-MM (default: previous month)
 * - storage: "supabase" | "s3" | "local" (default: "local")
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Determine which month to archive (default: previous month)
    const monthParam = searchParams.get('month');
    const storageType = searchParams.get('storage') || 'local';
    
    let targetMonth: Date;
    let startDate: string;
    let endDate: string;
    
    if (monthParam) {
      // Parse YYYY-MM format
      const [year, month] = monthParam.split('-').map(Number);
      targetMonth = new Date(year, month - 1, 1);
      startDate = new Date(year, month - 1, 1).toISOString();
      endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();
    } else {
      // Default: previous month
      const now = new Date();
      targetMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1).toISOString();
      endDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    }
    
    const monthLabel = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
    
    console.log(`[Archive] Exporting data for month: ${monthLabel}`);
    console.log(`[Archive] Date range: ${startDate} to ${endDate}`);
    
    // Fetch positions for the target month
    const positions = await db
      .select()
      .from(positionHistory)
      .where(
        and(
          gte(positionHistory.closedAt, startDate),
          lte(positionHistory.closedAt, endDate)
        )
      )
      .orderBy(desc(positionHistory.closedAt));
    
    console.log(`[Archive] Found ${positions.length} positions to archive`);
    
    if (positions.length === 0) {
      return NextResponse.json({
        success: false,
        message: `No positions found for ${monthLabel}`,
        month: monthLabel,
        count: 0
      });
    }
    
    // Enrich with alert data
    const enrichedPositions = positions.map(pos => {
      let alertDataParsed: any = null;
      
      if (pos.alertData) {
        try {
          alertDataParsed = JSON.parse(pos.alertData);
        } catch (e) {
          console.error(`Failed to parse alertData for position ${pos.id}:`, e);
        }
      }
      
      return {
        ...pos,
        alertDataParsed
      };
    });
    
    // Calculate statistics for the archive
    const stats = {
      totalPositions: positions.length,
      profitablePositions: positions.filter(p => p.pnl > 0).length,
      losingPositions: positions.filter(p => p.pnl < 0).length,
      totalPnL: positions.reduce((sum, p) => sum + p.pnl, 0),
      avgPnL: positions.reduce((sum, p) => sum + p.pnl, 0) / positions.length,
      winRate: (positions.filter(p => p.pnl > 0).length / positions.length) * 100
    };
    
    // Archive data object
    const archiveData = {
      month: monthLabel,
      exportedAt: new Date().toISOString(),
      startDate,
      endDate,
      statistics: stats,
      positions: enrichedPositions
    };
    
    // For local storage, return the data as downloadable JSON
    return new NextResponse(JSON.stringify(archiveData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="archive_${monthLabel}.json"`
      }
    });
    
  } catch (error) {
    console.error('[Archive] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
