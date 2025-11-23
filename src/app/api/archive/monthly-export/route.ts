import { NextRequest, NextResponse } from 'next/server';

/**
 * 📦 AUTOMATED MONTHLY ARCHIVE
 * 
 * ⚠️ CURRENTLY DISABLED - Supabase Storage integration needs to be configured
 * 
 * This endpoint would auto-export old position data to Supabase Storage.
 * To enable, install @supabase/supabase-js and configure environment variables.
 * 
 * Usage:
 * - Manual: GET /api/archive/monthly-export
 * - Cron: Setup a monthly cron job to call this endpoint
 * 
 * Query Parameters:
 * - month: YYYY-MM (default: previous month)
 */

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: false,
    error: 'Archive feature is currently disabled. Supabase Storage integration needs to be configured.',
    message: 'To enable: Install @supabase/supabase-js, configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY, then re-implement archive logic.'
  }, { status: 503 });
}