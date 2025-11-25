import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { positionHistory, botSettings } from '@/db/schema';
import { desc } from 'drizzle-orm';

// ✅ DIRECT BYBIT API REQUESTS (no proxy needed)
// Vercel Edge will route from Singapore/Hong Kong regions
export const runtime = 'edge';
export const preferredRegion = ['sin1', 'hkg1', 'icn1'];

interface BybitHistoryPosition {
  symbol: string;
  side: "Buy" | "Sell";
  avgEntryPrice: string;
  avgExitPrice: string;
  qty: string;
  closedPnl: string;
  createdTime: string;
  updatedTime: string;
  orderId: string;
}

async function signBybitRequest(
  apiKey: string,
  apiSecret: string,
  timestamp: number,
  params: Record<string, any>
) {
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const signString = timestamp + apiKey + 5000 + queryString;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(signString);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}

async function fetchAllBybitHistory(apiKey: string, apiSecret: string): Promise<BybitHistoryPosition[]> {
  const allPositions: BybitHistoryPosition[] = [];
  const now = Date.now();
  const daysBack = 30; // ✅ 30 days to match sync endpoint
  const totalMs = daysBack * 24 * 60 * 60 * 1000;
  const segmentMs = 7 * 24 * 60 * 60 * 1000; // ✅ 7-day segments

  console.log(`[Diagnose] Fetching Bybit history for last ${daysBack} days in 7-day segments...`);

  // ✅ Create 7-day segments
  const segments: Array<{ start: number; end: number }> = [];
  let currentStart = now - totalMs;
  while (currentStart < now) {
    const currentEnd = Math.min(currentStart + segmentMs, now);
    segments.push({ start: currentStart, end: currentEnd });
    currentStart = currentEnd;
  }

  console.log(`[Diagnose] Created ${segments.length} segments of max 7 days each`);

  // ✅ Fetch each segment
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const segmentStartDate = new Date(segment.start).toISOString().split('T')[0];
    const segmentEndDate = new Date(segment.end).toISOString().split('T')[0];
    
    console.log(`[Diagnose] Fetching segment ${i + 1}/${segments.length}: ${segmentStartDate} to ${segmentEndDate}`);

    let cursor: string | undefined = undefined;
    let pageCount = 0;

    do {
      const timestamp = Date.now();
      const params: Record<string, any> = {
        category: "linear",
        startTime: segment.start.toString(),
        endTime: segment.end.toString(),
        limit: "100",
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const signature = await signBybitRequest(apiKey, apiSecret, timestamp, params);
      const queryString = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&");

      const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "X-BAPI-API-KEY": apiKey,
          "X-BAPI-TIMESTAMP": timestamp.toString(),
          "X-BAPI-SIGN": signature,
          "X-BAPI-RECV-WINDOW": "5000",
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (data.retCode !== 0) {
        throw new Error(`Bybit API error: ${data.retMsg}`);
      }

      const positions = data.result?.list || [];
      allPositions.push(...positions);

      cursor = data.result?.nextPageCursor;
      pageCount++;
      
      console.log(`[Diagnose] Segment ${i + 1} page ${pageCount}: ${positions.length} positions, total: ${allPositions.length}`);

      if (cursor && pageCount < 20) {
        await new Promise(resolve => setTimeout(resolve, 200));
      } else if (pageCount >= 20) {
        console.log(`[Diagnose] ⚠️ Reached safety limit of 20 pages for segment ${i + 1}`);
        break;
      }
    } while (cursor);
  }

  console.log(`[Diagnose] ✅ Total Bybit positions fetched: ${allPositions.length}`);
  return allPositions;
}

export async function GET(request: NextRequest) {
  try {
    console.log('\n🔍 [DIAGNOSE] Starting history mismatch diagnosis...');

    // Get credentials
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json({
        success: false,
        message: "Missing API credentials"
      }, { status: 400 });
    }

    const { apiKey, apiSecret } = settings[0];

    // Fetch all positions from database
    console.log('\n📊 [DIAGNOSE] Fetching positions from database...');
    const dbPositions = await db
      .select()
      .from(positionHistory)
      .orderBy(desc(positionHistory.closedAt));

    console.log(`[Diagnose] Database has ${dbPositions.length} positions`);

    // Fetch all positions from Bybit
    console.log('\n🌐 [DIAGNOSE] Fetching positions from Bybit...');
    const bybitPositions = await fetchAllBybitHistory(apiKey!, apiSecret!);
    console.log(`[Diagnose] Bybit has ${bybitPositions.length} positions`);

    // Calculate statistics
    const dbStats = {
      count: dbPositions.length,
      totalPnl: dbPositions.reduce((sum, p) => sum + p.pnl, 0),
      profitable: dbPositions.filter(p => p.pnl > 0).length,
      losses: dbPositions.filter(p => p.pnl < 0).length,
      winRate: dbPositions.length > 0 ? (dbPositions.filter(p => p.pnl > 0).length / dbPositions.length) * 100 : 0,
    };

    const bybitStats = {
      count: bybitPositions.length,
      totalPnl: bybitPositions.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0),
      profitable: bybitPositions.filter(p => parseFloat(p.closedPnl) > 0).length,
      losses: bybitPositions.filter(p => parseFloat(p.closedPnl) < 0).length,
      winRate: bybitPositions.length > 0 ? (bybitPositions.filter(p => parseFloat(p.closedPnl) > 0).length / bybitPositions.length) * 100 : 0,
    };

    console.log('\n📊 [DIAGNOSE] Statistics comparison:');
    console.log('Database:', dbStats);
    console.log('Bybit:', bybitStats);

    // Find duplicates in database
    console.log('\n🔍 [DIAGNOSE] Checking for duplicates in database...');
    const duplicates: any[] = [];
    const seen = new Map<string, any[]>();

    for (const pos of dbPositions) {
      const key = `${pos.symbol}_${pos.side}_${pos.entryPrice.toFixed(4)}_${new Date(pos.closedAt!).getTime()}`;
      if (!seen.has(key)) {
        seen.set(key, []);
      }
      seen.get(key)!.push(pos);
    }

    for (const [key, positions] of seen.entries()) {
      if (positions.length > 1) {
        duplicates.push({
          key,
          count: positions.length,
          positions: positions.map(p => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            pnl: p.pnl,
            closedAt: p.closedAt
          }))
        });
      }
    }

    console.log(`[Diagnose] Found ${duplicates.length} duplicate groups`);

    // Find positions in DB but not in Bybit
    console.log('\n🔍 [DIAGNOSE] Finding positions in DB but not in Bybit...');
    const inDbNotInBybit: any[] = [];

    for (const dbPos of dbPositions) {
      const found = bybitPositions.find(bp => {
        const entryMatch = Math.abs(parseFloat(bp.avgEntryPrice) - dbPos.entryPrice) < dbPos.entryPrice * 0.001;
        const timeMatch = Math.abs(
          parseInt(bp.updatedTime) - new Date(dbPos.closedAt!).getTime()
        ) < 300000; // 5 min tolerance
        return bp.symbol === dbPos.symbol && bp.side === dbPos.side && entryMatch && timeMatch;
      });

      if (!found) {
        inDbNotInBybit.push({
          id: dbPos.id,
          symbol: dbPos.symbol,
          side: dbPos.side,
          pnl: dbPos.pnl,
          entryPrice: dbPos.entryPrice,
          closedAt: dbPos.closedAt
        });
      }
    }

    console.log(`[Diagnose] Found ${inDbNotInBybit.length} positions in DB but not in Bybit`);

    // Find positions in Bybit but not in DB
    console.log('\n🔍 [DIAGNOSE] Finding positions in Bybit but not in DB...');
    const inBybitNotInDb: any[] = [];

    for (const bybitPos of bybitPositions) {
      const found = dbPositions.find(dp => {
        const entryMatch = Math.abs(dp.entryPrice - parseFloat(bybitPos.avgEntryPrice)) < parseFloat(bybitPos.avgEntryPrice) * 0.001;
        const timeMatch = Math.abs(
          new Date(dp.closedAt!).getTime() - parseInt(bybitPos.updatedTime)
        ) < 300000; // 5 min tolerance
        return dp.symbol === bybitPos.symbol && dp.side === bybitPos.side && entryMatch && timeMatch;
      });

      if (!found) {
        inBybitNotInDb.push({
          symbol: bybitPos.symbol,
          side: bybitPos.side,
          pnl: parseFloat(bybitPos.closedPnl),
          entryPrice: parseFloat(bybitPos.avgEntryPrice),
          closedAt: new Date(parseInt(bybitPos.updatedTime)).toISOString()
        });
      }
    }

    console.log(`[Diagnose] Found ${inBybitNotInDb.length} positions in Bybit but not in DB`);

    // Detailed analysis
    const analysis = {
      summary: {
        database: dbStats,
        bybit: bybitStats,
        discrepancy: {
          countDiff: dbStats.count - bybitStats.count,
          pnlDiff: dbStats.totalPnl - bybitStats.totalPnl,
        }
      },
      duplicates: {
        count: duplicates.length,
        totalDuplicatedPositions: duplicates.reduce((sum, d) => sum + (d.count - 1), 0),
        details: duplicates.slice(0, 10) // First 10 for brevity
      },
      missingFromBybit: {
        count: inDbNotInBybit.length,
        totalPnl: inDbNotInBybit.reduce((sum, p) => sum + p.pnl, 0),
        details: inDbNotInBybit.slice(0, 10)
      },
      missingFromDb: {
        count: inBybitNotInDb.length,
        totalPnl: inBybitNotInDb.reduce((sum, p) => sum + p.pnl, 0),
        details: inBybitNotInDb.slice(0, 10)
      }
    };

    console.log('\n✅ [DIAGNOSE] Diagnosis complete');
    console.log('Summary:', analysis.summary);

    return NextResponse.json({
      success: true,
      analysis,
      recommendations: [
        duplicates.length > 0 ? `⚠️ Found ${duplicates.length} duplicate groups - run cleanup` : null,
        inDbNotInBybit.length > 0 ? `⚠️ ${inDbNotInBybit.length} positions in DB but not in Bybit - might be old data` : null,
        inBybitNotInDb.length > 0 ? `⚠️ ${inBybitNotInDb.length} positions in Bybit but not in DB - run import` : null,
      ].filter(Boolean)
    });

  } catch (error: any) {
    console.error('[DIAGNOSE] Error:', error);
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
}