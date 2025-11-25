import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { positionHistory, botSettings } from "@/db/schema";

// ✅ CRITICAL FIX: Use Edge Runtime to bypass geo-blocking
export const runtime = 'edge';
export const preferredRegion = ['sin1', 'hkg1', 'icn1']; // Singapore, Hong Kong, Seoul
export const dynamic = "force-dynamic";

/**
 * 🔄 FULL BYBIT HISTORY SYNC
 * 
 * This endpoint:
 * 1. Deletes ALL positions from local database
 * 2. Imports fresh history from Bybit (last 30 days)
 * 3. Returns count of imported positions
 */

// ============================================
// 🔐 BYBIT SIGNATURE HELPER (Web Crypto API)
// ============================================

async function createBybitSignature(
  timestamp: string,
  apiKey: string,
  apiSecret: string,
  recvWindow: string,
  queryString: string
): Promise<string> {
  const message = timestamp + apiKey + recvWindow + queryString;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

// ============================================
// 🔍 FILTER OUT FUNDING TRANSACTIONS
// ============================================

/**
 * Determines if a Bybit closed position is a real trade or a funding transaction
 */
function isRealPosition(bybitPos: any): boolean {
  try {
    const entryPrice = parseFloat(bybitPos.avgEntryPrice);
    const exitPrice = parseFloat(bybitPos.avgExitPrice);
    const pnl = parseFloat(bybitPos.closedPnl);
    
    // Calculate duration
    const openedAt = new Date(parseInt(bybitPos.createdTime));
    const closedAt = new Date(parseInt(bybitPos.updatedTime));
    const durationMs = closedAt.getTime() - openedAt.getTime();
    const durationSeconds = durationMs / 1000;
    
    // Calculate price difference
    const priceDiff = Math.abs(entryPrice - exitPrice);
    const priceDiffPercent = entryPrice > 0 ? (priceDiff / entryPrice) * 100 : 0;
    
    // ✅ ENHANCED FILTERING: Multiple criteria to catch funding transactions
    
    // Criterion 1: Very short duration with no price movement
    const isFundingByDuration = durationSeconds < 10 && priceDiffPercent < 0.01;
    
    // Criterion 2: Exactly zero PnL with same entry/exit price (pure funding)
    const isFundingByZeroPnL = Math.abs(pnl) < 0.0001 && priceDiffPercent < 0.0001;
    
    // Criterion 3: Duration < 30 seconds with almost no price movement and near-zero PnL
    const isFundingByNearInstant = durationSeconds < 30 && priceDiffPercent < 0.001 && Math.abs(pnl) < 0.01;
    
    const isFundingTransaction = isFundingByDuration || isFundingByZeroPnL || isFundingByNearInstant;
    
    if (isFundingTransaction) {
      console.log(`   🚫 FILTERED: ${bybitPos.symbol} - Funding transaction`);
      console.log(`      Duration: ${durationSeconds.toFixed(1)}s, Price diff: ${priceDiffPercent.toFixed(4)}%, PnL: ${pnl.toFixed(4)}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`   ⚠️ Error checking position:`, error);
    return true; // Default to including if we can't determine
  }
}

// ============================================
// 🔗 AGGREGATE PARTIAL CLOSES
// ============================================

/**
 * Aggregates multiple partial closes into single positions (matches Bybit Performance display)
 * 
 * Bybit API returns each partial close as separate position, but Performance page aggregates them.
 * Example:
 * - Open BTCUSDT 1.0 qty
 * - Close 0.3 at TP1 → API returns position #1
 * - Close 0.3 at TP2 → API returns position #2  
 * - Close 0.4 at TP3 → API returns position #3
 * 
 * Performance shows: 1 position with aggregated PnL
 * This function mimics that behavior
 */
function aggregatePartialCloses(positions: any[]): any[] {
  console.log(`\n🔗 Aggregating partial closes...`);
  
  // Group by symbol + side + similar entry price + close time window
  const groups = new Map<string, any[]>();
  
  for (const pos of positions) {
    const entryPrice = parseFloat(pos.avgEntryPrice);
    const createdTime = parseInt(pos.createdTime);
    const updatedTime = parseInt(pos.updatedTime);
    
    // Round entry price to 2 decimal places for grouping (handles slight variations)
    const entryPriceRounded = Math.round(entryPrice * 100) / 100;
    
    // Create key: symbol_side_entryPrice_dayOfOpen
    const openDay = Math.floor(createdTime / (24 * 60 * 60 * 1000));
    const key = `${pos.symbol}_${pos.side}_${entryPriceRounded}_${openDay}`;
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(pos);
  }
  
  console.log(`   📊 Found ${groups.size} position groups from ${positions.length} entries`);
  
  const aggregated: any[] = [];
  let aggregatedCount = 0;
  
  for (const [key, groupPositions] of groups.entries()) {
    if (groupPositions.length === 1) {
      // Single position - no aggregation needed
      aggregated.push(groupPositions[0]);
    } else {
      // Multiple positions - aggregate them
      console.log(`   🔗 Aggregating ${groupPositions.length} partial closes for ${key.split('_')[0]}`);
      
      // Sort by close time (earliest first)
      groupPositions.sort((a, b) => parseInt(a.updatedTime) - parseInt(b.updatedTime));
      
      // Use first position as base
      const base = groupPositions[0];
      
      // Aggregate quantities and PnL
      const totalQty = groupPositions.reduce((sum, p) => sum + parseFloat(p.qty), 0);
      const totalPnl = groupPositions.reduce((sum, p) => sum + parseFloat(p.closedPnl), 0);
      
      // Calculate weighted average exit price
      const totalQtyTimesExit = groupPositions.reduce((sum, p) => 
        sum + (parseFloat(p.qty) * parseFloat(p.avgExitPrice)), 0
      );
      const avgExitPrice = totalQtyTimesExit / totalQty;
      
      // Create aggregated position
      const aggregatedPosition = {
        ...base,
        qty: totalQty.toString(),
        closedPnl: totalPnl.toString(),
        avgExitPrice: avgExitPrice.toString(),
        updatedTime: groupPositions[groupPositions.length - 1].updatedTime, // Use last close time
        orderId: `${base.orderId}_aggregated_${groupPositions.length}`, // Mark as aggregated
      };
      
      aggregated.push(aggregatedPosition);
      aggregatedCount += (groupPositions.length - 1); // Count how many were merged
      
      console.log(`      ✅ ${groupPositions.length} closes → 1 position (${totalQty.toFixed(4)} qty, ${totalPnl.toFixed(2)} PnL)`);
    }
  }
  
  console.log(`   ✅ Aggregation complete: ${positions.length} → ${aggregated.length} positions (merged ${aggregatedCount} partial closes)`);
  
  return aggregated;
}

// ============================================
// 📥 FETCH FROM BYBIT (7-DAY SEGMENTS)
// ============================================

async function fetchBybitHistorySegment(
  apiKey: string,
  apiSecret: string,
  startTime: number,
  endTime: number
): Promise<any[]> {
  let allPositions: any[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 10;

  do {
    pageCount++;
    const timestamp = Date.now().toString();
    const recvWindow = "5000";
    
    const params: Record<string, string> = {
      category: "linear",
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      limit: "100",
    };
    
    if (cursor) {
      params.cursor = cursor;
    }
    
    const queryString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");
    
    const signature = await createBybitSignature(timestamp, apiKey, apiSecret, recvWindow, queryString);
    
    const url = `https://api.bybit.com/v5/position/closed-pnl?${queryString}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": timestamp,
        "X-BAPI-SIGN": signature,
        "X-BAPI-RECV-WINDOW": recvWindow,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bybit API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(`Bybit API error: ${data.retMsg} (code: ${data.retCode})`);
    }
    
    const positions = data.result?.list || [];
    allPositions = [...allPositions, ...positions];
    
    cursor = data.result?.nextPageCursor || null;
    
    if (pageCount >= maxPages) {
      console.log(`[Sync] ⚠️ Reached page limit for segment`);
      break;
    }
  } while (cursor);
  
  return allPositions;
}

export async function POST(request: NextRequest) {
  try {
    console.log(`\n🔄 ========== FULL BYBIT SYNC START ==========`);
    
    // Get bot settings
    const settings = await db.select().from(botSettings).limit(1);
    
    if (settings.length === 0 || !settings[0].apiKey || !settings[0].apiSecret) {
      return NextResponse.json({
        success: false,
        message: "Brak konfiguracji API Bybit. Skonfiguruj klucze w ustawieniach.",
      }, { status: 400 });
    }
    
    const { apiKey, apiSecret } = settings[0];
    
    // STEP 1: Delete ALL positions from database
    console.log(`\n🗑️ STEP 1: Deleting all positions from database...`);
    
    const deletedCount = await db.delete(positionHistory);
    
    console.log(`✅ Deleted all positions from database`);
    
    // STEP 2: Fetch history from Bybit (last 30 days, divided into 7-day segments)
    console.log(`\n📥 STEP 2: Fetching history from Bybit (last 30 days)...`);
    
    const daysBack = 30;
    const now = Date.now();
    const totalMs = daysBack * 24 * 60 * 60 * 1000;
    const segmentMs = 7 * 24 * 60 * 60 * 1000;
    
    const segments: Array<{ start: number; end: number }> = [];
    let currentStart = now - totalMs;
    
    while (currentStart < now) {
      const currentEnd = Math.min(currentStart + segmentMs, now);
      segments.push({ start: currentStart, end: currentEnd });
      currentStart = currentEnd;
    }
    
    console.log(`📊 Created ${segments.length} segments of max 7 days each`);
    
    let allPositions: any[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentStartDate = new Date(segment.start).toISOString().split('T')[0];
      const segmentEndDate = new Date(segment.end).toISOString().split('T')[0];
      
      console.log(`📥 Fetching segment ${i + 1}/${segments.length}: ${segmentStartDate} to ${segmentEndDate}`);
      
      try {
        const segmentPositions = await fetchBybitHistorySegment(
          apiKey!,
          apiSecret!,
          segment.start,
          segment.end
        );
        
        allPositions = [...allPositions, ...segmentPositions];
        console.log(`   ✅ Segment ${i + 1}: ${segmentPositions.length} positions (total: ${allPositions.length})`);
      } catch (error) {
        console.error(`   ❌ Segment ${i + 1} failed:`, error);
        // Continue with next segment
      }
    }
    
    console.log(`\n✅ Fetched ${allPositions.length} total positions from Bybit`);
    
    // ✅ STEP 2.5: Filter out funding transactions
    console.log(`\n🔍 STEP 2.5: Filtering out funding transactions...`);
    
    const realPositions = allPositions.filter(isRealPosition);
    const filteredCount = allPositions.length - realPositions.length;
    
    console.log(`   ✅ Filtered: ${realPositions.length} real positions, ${filteredCount} funding transactions removed`);
    
    // ✅ NEW STEP 2.6: Aggregate partial closes
    const aggregatedPositions = aggregatePartialCloses(realPositions);
    
    if (aggregatedPositions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Brak pozycji w Bybit za ostatnie 30 dni",
        deleted: 0,
        imported: 0,
        filtered: filteredCount,
        aggregated: 0,
      });
    }
    
    // STEP 3: Import all positions to database
    console.log(`\n💾 STEP 3: Importing ${aggregatedPositions.length} positions to database...`);
    
    let imported = 0;
    
    for (const bybitPos of aggregatedPositions) {
      const entryPrice = parseFloat(bybitPos.avgEntryPrice);
      const exitPrice = parseFloat(bybitPos.avgExitPrice);
      const qty = parseFloat(bybitPos.qty);
      const netPnl = parseFloat(bybitPos.closedPnl); // This is AFTER fees
      const leverage = parseInt(bybitPos.leverage);
      
      const closedAt = new Date(parseInt(bybitPos.updatedTime));
      const openedAt = new Date(parseInt(bybitPos.createdTime));
      
      const positionValue = qty * entryPrice;
      const initialMargin = positionValue / leverage;
      const pnlPercent = initialMargin > 0 ? (netPnl / initialMargin) * 100 : 0;
      
      const durationMs = closedAt.getTime() - openedAt.getTime();
      const durationMinutes = Math.round(durationMs / 60000);
      
      // ✅ CALCULATE FEES
      // Gross PnL = theoretical PnL without fees
      const isLong = bybitPos.side === "Buy";
      const grossPnl = isLong 
        ? (exitPrice - entryPrice) * qty 
        : (entryPrice - exitPrice) * qty;
      
      // Total fees = gross - net (both can be negative, so we need abs of difference)
      const totalFees = Math.abs(grossPnl - netPnl);
      
      // Estimate trading fees (entry + exit)
      // Bybit taker fee: 0.055% (0.00055)
      const entryValue = qty * entryPrice;
      const exitValue = qty * exitPrice;
      const estimatedTradingFees = (entryValue + exitValue) * 0.00055; // 0.055% each side = 0.11% total
      
      // Funding fees = remaining fees (capped at total fees)
      const fundingFees = Math.max(0, totalFees - estimatedTradingFees);
      
      // Use estimated trading fees (more accurate than calculated difference)
      const tradingFees = estimatedTradingFees;
      
      console.log(`   💰 ${bybitPos.symbol}: Gross ${grossPnl.toFixed(4)} - Trading ${tradingFees.toFixed(4)} - Funding ${fundingFees.toFixed(4)} = Net ${netPnl.toFixed(4)}`);
      console.log(`      Entry value: ${entryValue.toFixed(2)}, Exit value: ${exitValue.toFixed(2)}`);
      
      let closeReason = "closed_on_exchange";
      if (netPnl > 0) {
        closeReason = "tp_main_hit";
      } else if (netPnl < 0) {
        closeReason = "sl_hit";
      }
      
      await db.insert(positionHistory).values({
        positionId: null,
        alertId: null,
        symbol: bybitPos.symbol,
        side: bybitPos.side,
        tier: "Standard",
        entryPrice,
        closePrice: exitPrice,
        quantity: qty,
        leverage,
        pnl: netPnl, // NET PnL (after fees)
        grossPnl: grossPnl, // GROSS PnL (before fees)
        tradingFees: tradingFees,
        fundingFees: fundingFees,
        totalFees: totalFees,
        pnlPercent,
        closeReason,
        tp1Hit: false,
        tp2Hit: false,
        tp3Hit: false,
        confirmationCount: 0,
        partialCloseCount: bybitPos.orderId.includes('_aggregated_') 
          ? parseInt(bybitPos.orderId.split('_aggregated_')[1]) 
          : 1,
        openedAt: openedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        durationMinutes,
      });
      
      imported++;
    }
    
    console.log(`✅ Imported ${imported} positions with fee calculations`);
    console.log(`\n🔄 ========== FULL BYBIT SYNC COMPLETE ==========\n`);
    
    return NextResponse.json({
      success: true,
      message: `✅ Synchronizacja: ${imported} pozycji z Bybit (z opłatami)`,
      deleted: 0,
      imported,
      filtered: filteredCount,
      aggregated: realPositions.length - aggregatedPositions.length,
      daysBack: 30,
    });
    
  } catch (error) {
    console.error("[Sync Bybit History] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}