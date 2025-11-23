import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory } from '@/db/schema';
import { and, gte, lte, desc } from 'drizzle-orm';
// TEMPORARILY DISABLED: Supabase integration commented out to fix Vercel deployment
// Uncomment when you want to enable Supabase Storage archiving
// import { createClient } from '@supabase/supabase-js';

/**
 * 📦 AUTOMATED MONTHLY ARCHIVE
 * 
 * ⚠️ CURRENTLY DISABLED - Supabase Storage integration is commented out
 * 
 * Auto-exports old position data to Supabase Storage.
 * This endpoint can be called manually or via a cron job.
 * 
 * Usage:
 * - Manual: GET /api/archive/monthly-export
 * - Cron: Setup a monthly cron job to call this endpoint
 * 
 * Query Parameters:
 * - month: YYYY-MM (default: previous month)
 */

export async function GET(request: NextRequest) {
  // FEATURE TEMPORARILY DISABLED
  return NextResponse.json({
    success: false,
    error: 'Archive feature is currently disabled. Supabase Storage integration needs to be configured.',
    message: 'To enable: Uncomment Supabase import in src/app/api/archive/monthly-export/route.ts and configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY'
  }, { status: 503 });

  /* ORIGINAL CODE - COMMENTED OUT TO FIX DEPLOYMENT
  try {
    const { searchParams } = new URL(request.url);
    
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[Archive] Missing Supabase credentials');
      return NextResponse.json({
        success: false,
        error: 'Supabase credentials not configured'
      }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Determine which month to archive (default: previous month)
    const monthParam = searchParams.get('month');
    
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
        success: true,
        message: `No positions found for ${monthLabel}`,
        month: monthLabel,
        count: 0,
        archived: false
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
    
    // Upload to Supabase Storage
    const fileName = `archive_${monthLabel}.json`;
    const fileContent = JSON.stringify(archiveData, null, 2);
    
    console.log(`[Archive] Uploading to Supabase: ${fileName}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('trading-archives')
      .upload(fileName, fileContent, {
        contentType: 'application/json',
        upsert: true // Overwrite if exists
      });
    
    if (uploadError) {
      console.error('[Archive] Supabase upload error:', uploadError);
      return NextResponse.json({
        success: false,
        error: `Failed to upload to Supabase: ${uploadError.message}`,
        month: monthLabel,
        count: positions.length
      }, { status: 500 });
    }
    
    console.log('[Archive] Upload successful:', uploadData);
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('trading-archives')
      .getPublicUrl(fileName);
    
    console.log('[Archive] Public URL:', urlData.publicUrl);
    
    return NextResponse.json({
      success: true,
      message: `Successfully archived ${positions.length} positions for ${monthLabel}`,
      month: monthLabel,
      count: positions.length,
      archived: true,
      storage: 'supabase',
      url: urlData.publicUrl,
      statistics: stats
    });
    
  } catch (error) {
    console.error('[Archive] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}