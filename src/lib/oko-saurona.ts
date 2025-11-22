import { db } from '@/db';
import { botSettings, botPositions, positionGuardActions, positionGuardLogs, symbolLocks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { makeOkxRequestWithRetry } from './okx-helpers';

// ============================================
// 🔐 OKO SAURONA - POSITION GUARD SYSTEM
// ============================================

interface OkoSettings {
  enabled: boolean;
  accountDrawdownThreshold: number; // percentage (e.g., 50 = -50%)
  capitulationThreshold: number; // number of closures before ban
  banDurationHours: number;
  timeBasedExitHours: number;
  timeBasedExitEnabled: boolean;
  capitulationCounter: number;
  bannedSymbols: string | null;
  slMarginRiskPercent: number; // from main settings
}

interface PositionData {
  id: number;
  symbol: string;
  side: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  currentSl: number;
  unrealisedPnl: number;
  initialMargin: number;
  openedAt: string;
  tp1Hit: boolean;
}

interface OkoCheckResult {
  shouldClose: boolean;
  shouldFix: boolean;
  action: string;
  reason: string;
  checkCount: number; // 1 or 3
  metadata?: any;
}

interface ConfirmationState {
  positionId: number;
  action: string;
  count: number;
  firstCheckTime: number;
  lastCheckData: any;
}

// ============================================
// 🆕 FAZA 2: NEW INTERFACES
// ============================================

interface AlgoOrderData {
  algoId: string;
  instId: string;
  slTriggerPx?: string;
  tpTriggerPx?: string;
  sz: string;
}

interface OkxCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  demo: boolean;
}

// In-memory confirmation tracking (persists across checks within same monitoring cycle)
const confirmationTracking = new Map<string, ConfirmationState>();

// ============================================
// 📊 HELPER: GET OKO SETTINGS
// ============================================

async function getOkoSettings(): Promise<OkoSettings | null> {
  const settings = await db.select().from(botSettings).limit(1);
  if (settings.length === 0) return null;

  const config = settings[0];
  
  return {
    enabled: config.okoEnabled || false,
    accountDrawdownThreshold: config.okoAccountDrawdownThreshold || 50,
    capitulationThreshold: config.okoCapitulationThreshold || 3,
    banDurationHours: config.okoBanDurationHours || 24,
    timeBasedExitHours: config.okoTimeBasedExitHours || 24,
    timeBasedExitEnabled: config.okoTimeBasedExitEnabled || false,
    capitulationCounter: config.okoCapitulationCounter || 0,
    bannedSymbols: config.okoBannedSymbols || null,
    slMarginRiskPercent: config.slMarginRiskPercent || 2.0,
  };
}

// ============================================
// 🆕 FAZA 2: GET ALGO ORDERS FROM OKX
// ============================================

async function getAlgoOrdersFromOkx(
  credentials: OkxCredentials
): Promise<AlgoOrderData[]> {
  try {
    const data = await makeOkxRequestWithRetry(
      'GET',
      '/api/v5/trade/orders-algo-pending?ordType=conditional',
      credentials.apiKey,
      credentials.apiSecret,
      credentials.passphrase,
      credentials.demo,
      undefined,
      2
    );

    if (data.code !== '0') {
      console.error(`❌ Failed to get algo orders: ${data.msg}`);
      return [];
    }

    return data.data || [];
  } catch (error: any) {
    console.error(`❌ Failed to fetch algo orders:`, error.message);
    return [];
  }
}

// ============================================
// 🆕 FAZA 2: GET OKX POSITIONS
// ============================================

async function getOkxPositions(
  credentials: OkxCredentials
): Promise<any[]> {
  try {
    const data = await makeOkxRequestWithRetry(
      'GET',
      '/api/v5/account/positions?instType=SWAP',
      credentials.apiKey,
      credentials.apiSecret,
      credentials.passphrase,
      credentials.demo,
      undefined,
      2
    );

    if (data.code !== '0') {
      console.error(`❌ Failed to get positions: ${data.msg}`);
      return [];
    }

    return (data.data || []).filter((p: any) => parseFloat(p.pos) !== 0);
  } catch (error: any) {
    console.error(`❌ Failed to fetch positions:`, error.message);
    return [];
  }
}

// ============================================
// 🆕 FAZA 2 - CHECK 5: MISSING SL/TP (SYNCHRONIZED WITH OKX)
// ============================================

export async function checkMissingSlTp(
  position: PositionData,
  credentials: OkxCredentials
): Promise<OkoCheckResult> {
  try {
    console.log(`   🔍 [OKO] Missing SL/TP Check (synchronized with OKX)...`);

    // Get real algo orders from OKX
    const algoOrders = await getAlgoOrdersFromOkx(credentials);
    const symbol = position.symbol.includes('-') 
      ? position.symbol 
      : `${position.symbol.replace('USDT', '')}-USDT-SWAP`;
    
    // ✅ CRITICAL FIX: Support NET MODE
    // In net mode, posSide is always "net" regardless of direction
    // Match by symbol only, not by side
    const positionAlgos = algoOrders.filter((a: AlgoOrderData) => a.instId === symbol);
    
    console.log(`   📊 Found ${positionAlgos.length} algo orders for ${symbol} (net mode)`);
    
    // ✅ CRITICAL FIX: Check for non-empty and non-zero values
    // OKX API may return empty strings or "0" which are truthy but invalid
    const hasRealSL = positionAlgos.some((a: AlgoOrderData) => {
      const valid = a.slTriggerPx && a.slTriggerPx !== '' && parseFloat(a.slTriggerPx) > 0;
      if (a.slTriggerPx) {
        console.log(`      SL order: ${a.slTriggerPx} (valid: ${valid})`);
      }
      return valid;
    });
    
    const hasRealTP = positionAlgos.some((a: AlgoOrderData) => {
      const valid = a.tpTriggerPx && a.tpTriggerPx !== '' && parseFloat(a.tpTriggerPx) > 0;
      if (a.tpTriggerPx) {
        console.log(`      TP order: ${a.tpTriggerPx} (valid: ${valid})`);
      }
      return valid;
    });

    console.log(`   📊 OKX Sync (net mode): SL=${hasRealSL}, TP=${hasRealTP} (Total algos: ${positionAlgos.length})`);

    if (!hasRealSL || !hasRealTP) {
      const missing = [];
      if (!hasRealSL) missing.push('SL');
      if (!hasRealTP) missing.push('TP');

      return {
        shouldClose: false,
        shouldFix: true,
        action: 'missing_sl_tp',
        reason: `Missing ${missing.join(' and ')} on OKX exchange (net mode)`,
        checkCount: 1, // Instant fix attempt
        metadata: {
          missingSL: !hasRealSL,
          missingTP: !hasRealTP,
          currentAlgoCount: positionAlgos.length,
          algoOrders: positionAlgos.map((a: AlgoOrderData) => ({
            algoId: a.algoId,
            slTriggerPx: a.slTriggerPx || 'none',
            tpTriggerPx: a.tpTriggerPx || 'none',
          })),
        }
      };
    }

    return {
      shouldClose: false,
      shouldFix: false,
      action: 'none',
      reason: 'SL/TP present on OKX',
      checkCount: 0,
    };
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to check SL/TP:`, error.message);
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'error',
      reason: error.message,
      checkCount: 0,
    };
  }
}

// ============================================
// 🆕 FAZA 2 - CHECK 6: TP1 QUANTITY FIX
// ============================================

export async function checkTp1QuantityMismatch(
  position: PositionData,
  credentials: OkxCredentials
): Promise<OkoCheckResult> {
  try {
    // Only check if TP1 was hit
    if (!position.tp1Hit) {
      return {
        shouldClose: false,
        shouldFix: false,
        action: 'none',
        reason: 'TP1 not hit yet',
        checkCount: 0,
      };
    }

    console.log(`   🔍 [OKO] TP1 Quantity Check...`);

    // Get real position from OKX
    const okxPositions = await getOkxPositions(credentials);
    const symbol = position.symbol.includes('-') 
      ? position.symbol 
      : `${position.symbol.replace('USDT', '')}-USDT-SWAP`;
    
    const okxPos = okxPositions.find((p: any) => p.instId === symbol);
    
    if (!okxPos) {
      return {
        shouldClose: false,
        shouldFix: false,
        action: 'none',
        reason: 'Position not found on OKX',
        checkCount: 0,
      };
    }

    const realQuantity = Math.abs(parseFloat(okxPos.pos));
    const dbQuantity = position.quantity;
    
    // Allow 0.1% tolerance for rounding
    const tolerance = dbQuantity * 0.001;
    const mismatch = Math.abs(realQuantity - dbQuantity) > tolerance;

    console.log(`   📊 Quantity: DB=${dbQuantity}, OKX=${realQuantity}, Mismatch=${mismatch}`);

    if (mismatch) {
      return {
        shouldClose: false,
        shouldFix: true,
        action: 'tp1_quantity_fix',
        reason: `Quantity mismatch: DB shows ${dbQuantity}, OKX shows ${realQuantity}`,
        checkCount: 1, // Instant fix
        metadata: {
          dbQuantity,
          realQuantity,
          difference: realQuantity - dbQuantity,
        }
      };
    }

    return {
      shouldClose: false,
      shouldFix: false,
      action: 'none',
      reason: 'Quantity matches',
      checkCount: 0,
    };
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to check TP1 quantity:`, error.message);
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'error',
      reason: error.message,
      checkCount: 0,
    };
  }
}

// ============================================
// 🆕 FAZA 2 - CHECK 7: MULTI-POSITION CORRELATION
// ============================================

export async function checkMultiPositionCorrelation(
  position: PositionData,
  allPositions: PositionData[]
): Promise<OkoCheckResult> {
  try {
    console.log(`   🔍 [OKO] Multi-Position Correlation Check...`);

    // Find all positions on the same symbol
    const sameSymbolPositions = allPositions.filter(p => p.symbol === position.symbol);
    
    if (sameSymbolPositions.length <= 1) {
      return {
        shouldClose: false,
        shouldFix: false,
        action: 'none',
        reason: 'Single position on symbol',
        checkCount: 0,
      };
    }

    console.log(`   📊 Found ${sameSymbolPositions.length} positions on ${position.symbol}`);

    // Check how many are on minus
    const positionsOnMinus = sameSymbolPositions.filter(p => p.unrealisedPnl < 0);
    const percentOnMinus = (positionsOnMinus.length / sameSymbolPositions.length) * 100;

    console.log(`   📉 Positions on minus: ${positionsOnMinus.length}/${sameSymbolPositions.length} (${percentOnMinus.toFixed(0)}%)`);

    // If >50% of positions on same symbol are losing, it's a bad symbol
    if (percentOnMinus > 50 && positionsOnMinus.length >= 2) {
      const totalLoss = positionsOnMinus.reduce((sum, p) => sum + p.unrealisedPnl, 0);

      return {
        shouldClose: true,
        shouldFix: false,
        action: 'multi_position_correlation',
        reason: `${positionsOnMinus.length}/${sameSymbolPositions.length} positions on ${position.symbol} are losing (total: ${totalLoss.toFixed(2)} USDT)`,
        checkCount: 3, // Requires confirmation
        metadata: {
          symbol: position.symbol,
          totalPositions: sameSymbolPositions.length,
          losingPositions: positionsOnMinus.length,
          totalLoss,
          percentOnMinus: percentOnMinus.toFixed(0),
        }
      };
    }

    return {
      shouldClose: false,
      shouldFix: false,
      action: 'none',
      reason: 'Multi-position correlation OK',
      checkCount: 0,
    };
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to check correlation:`, error.message);
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'error',
      reason: error.message,
      checkCount: 0,
    };
  }
}

// ============================================
// 🚨 CHECK 1: PNL EMERGENCY (3 checks)
// ============================================

export async function checkPnlEmergency(
  position: PositionData,
  settings: OkoSettings
): Promise<OkoCheckResult> {
  // Calculate PnL percentage based on initial margin
  const pnlPercent = (position.unrealisedPnl / position.initialMargin) * 100;
  const threshold = -Math.abs(settings.slMarginRiskPercent);

  console.log(`   🔍 [OKO] PnL Emergency Check: ${pnlPercent.toFixed(2)}% (threshold: ${threshold}%)`);

  if (pnlPercent <= threshold) {
    return {
      shouldClose: true,
      shouldFix: false,
      action: 'pnl_emergency',
      reason: `PnL ${pnlPercent.toFixed(2)}% exceeded threshold ${threshold}%`,
      checkCount: 3, // Requires 3 confirmations
      metadata: {
        pnl: position.unrealisedPnl,
        pnlPercent: pnlPercent.toFixed(2),
        threshold,
        currentPrice: position.currentPrice,
      }
    };
  }

  return {
    shouldClose: false,
    shouldFix: false,
    action: 'none',
    reason: 'PnL within safe range',
    checkCount: 0,
  };
}

// ============================================
// 🚨 CHECK 2: SL BREACH (1 check - instant)
// ============================================

export async function checkSlBreach(
  position: PositionData,
  settings: OkoSettings
): Promise<OkoCheckResult> {
  const isLong = position.side === 'BUY';
  const currentSl = position.currentSl;
  const currentPrice = position.currentPrice;
  
  // Check if price is 2% beyond SL
  const slBreachThreshold = 0.02; // 2%
  
  let isBreach = false;
  let breachPercent = 0;
  
  if (isLong) {
    // For LONG: price dropped below SL
    if (currentPrice < currentSl) {
      breachPercent = ((currentSl - currentPrice) / currentSl) * 100;
      isBreach = breachPercent > (slBreachThreshold * 100);
    }
  } else {
    // For SHORT: price rose above SL
    if (currentPrice > currentSl) {
      breachPercent = ((currentPrice - currentSl) / currentSl) * 100;
      isBreach = breachPercent > (slBreachThreshold * 100);
    }
  }

  console.log(`   🔍 [OKO] SL Breach Check: Price ${currentPrice} vs SL ${currentSl} (breach: ${isBreach}, ${breachPercent.toFixed(2)}%)`);

  if (isBreach) {
    return {
      shouldClose: true,
      shouldFix: false,
      action: 'sl_breach',
      reason: `Price breached SL by ${breachPercent.toFixed(2)}% (>${slBreachThreshold * 100}%)`,
      checkCount: 1, // Instant close - no confirmation needed
      metadata: {
        currentPrice,
        currentSl,
        breachPercent: breachPercent.toFixed(2),
        side: position.side,
      }
    };
  }

  return {
    shouldClose: false,
    shouldFix: false,
    action: 'none',
    reason: 'SL not breached',
    checkCount: 0,
  };
}

// ============================================
// 🚨 CHECK 3: ACCOUNT DRAWDOWN (3 checks)
// ============================================

export async function checkAccountDrawdown(
  allPositions: PositionData[],
  settings: OkoSettings
): Promise<{ shouldCloseAll: boolean; reason: string; totalPnl: number; totalMargin: number }> {
  // Calculate total unrealized PnL across all open positions
  const totalPnl = allPositions.reduce((sum, pos) => sum + pos.unrealisedPnl, 0);
  const totalMargin = allPositions.reduce((sum, pos) => sum + pos.initialMargin, 0);
  
  const drawdownPercent = totalMargin > 0 ? (totalPnl / totalMargin) * 100 : 0;
  const threshold = -Math.abs(settings.accountDrawdownThreshold);

  console.log(`   🔍 [OKO] Account Drawdown Check: ${drawdownPercent.toFixed(2)}% (threshold: ${threshold}%)`);

  if (drawdownPercent <= threshold) {
    return {
      shouldCloseAll: true,
      reason: `Account drawdown ${drawdownPercent.toFixed(2)}% exceeded threshold ${threshold}%`,
      totalPnl,
      totalMargin,
    };
  }

  return {
    shouldCloseAll: false,
    reason: 'Account drawdown within safe range',
    totalPnl,
    totalMargin,
  };
}

// ============================================
// 🚨 CHECK 4: TIME-BASED EXIT (optional)
// ============================================

export async function checkTimeBasedExit(
  position: PositionData,
  settings: OkoSettings
): Promise<OkoCheckResult> {
  if (!settings.timeBasedExitEnabled) {
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'none',
      reason: 'Time-based exit disabled',
      checkCount: 0,
    };
  }

  const openedAt = new Date(position.openedAt).getTime();
  const now = Date.now();
  const ageHours = (now - openedAt) / (1000 * 60 * 60);
  const pnlPercent = (position.unrealisedPnl / position.initialMargin) * 100;

  console.log(`   🔍 [OKO] Time-Based Exit Check: ${ageHours.toFixed(1)}h old, PnL: ${pnlPercent.toFixed(2)}%`);

  // Only close if position is old AND on minus
  if (ageHours >= settings.timeBasedExitHours && position.unrealisedPnl < 0) {
    return {
      shouldClose: true,
      shouldFix: false,
      action: 'time_based_exit',
      reason: `Position on minus for ${ageHours.toFixed(1)}h (threshold: ${settings.timeBasedExitHours}h)`,
      checkCount: 3,
      metadata: {
        ageHours: ageHours.toFixed(1),
        pnl: position.unrealisedPnl,
        pnlPercent: pnlPercent.toFixed(2),
      }
    };
  }

  return {
    shouldClose: false,
    shouldFix: false,
    action: 'none',
    reason: 'Position age or PnL OK',
    checkCount: 0,
  };
}

// ============================================
// 🆕 FAZA 3 - CHECK 8: GHOST POSITION CLEANUP
// ============================================

export async function checkGhostPosition(
  position: PositionData,
  okxPositions: any[]
): Promise<OkoCheckResult> {
  try {
    console.log(`   🔍 [OKO] Ghost Position Check...`);

    // Check if position exists on OKX
    const symbol = position.symbol.includes('-') 
      ? position.symbol 
      : `${position.symbol.replace('USDT', '')}-USDT-SWAP`;
    
    const okxPos = okxPositions.find((p: any) => p.instId === symbol);
    
    if (!okxPos || parseFloat(okxPos.pos) === 0) {
      // Position doesn't exist on exchange but exists in DB = GHOST
      return {
        shouldClose: false,
        shouldFix: true,
        action: 'ghost_position_cleanup',
        reason: 'Position exists in DB but not on exchange',
        checkCount: 1, // Instant cleanup
        metadata: {
          symbol: position.symbol,
          dbId: position.id,
          foundOnExchange: false,
        }
      };
    }

    // Verify position direction matches
    const okxSide = parseFloat(okxPos.pos) > 0 ? 'BUY' : 'SELL';
    if (okxSide !== position.side) {
      return {
        shouldClose: false,
        shouldFix: true,
        action: 'ghost_position_direction_mismatch',
        reason: `DB shows ${position.side}, exchange shows ${okxSide}`,
        checkCount: 1,
        metadata: {
          symbol: position.symbol,
          dbSide: position.side,
          okxSide,
        }
      };
    }

    return {
      shouldClose: false,
      shouldFix: false,
      action: 'none',
      reason: 'Position exists on exchange',
      checkCount: 0,
    };
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to check ghost position:`, error.message);
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'error',
      reason: error.message,
      checkCount: 0,
    };
  }
}

// ============================================
// 🆕 FAZA 4 - CHECK 9: GHOST ORDERS CLEANUP
// ============================================

export async function checkAndCleanupGhostOrders(
  credentials: OkxCredentials,
  openPositions: PositionData[]
): Promise<{
  cleaned: number;
  failed: number;
  details: Array<{ symbol: string; orderType: string; orderId: string; status: 'cancelled' | 'failed' }>;
}> {
  try {
    console.log(`   🔍 [OKO] Ghost Orders Cleanup Check...`);

    // Get all algo orders from OKX
    const algoOrders = await getAlgoOrdersFromOkx(credentials);
    
    if (algoOrders.length === 0) {
      console.log(`   ✅ [OKO] No algo orders found`);
      return { cleaned: 0, failed: 0, details: [] };
    }

    // Get list of symbols with open positions
    const openSymbols = new Set(
      openPositions.map(p => 
        p.symbol.includes('-') ? p.symbol : `${p.symbol.replace('USDT', '')}-USDT-SWAP`
      )
    );

    console.log(`   📊 Open positions: ${Array.from(openSymbols).join(', ')}`);
    console.log(`   📊 Total algo orders: ${algoOrders.length}`);

    // Find ghost orders (orders for symbols without positions)
    const ghostOrders = algoOrders.filter((order: AlgoOrderData) => 
      !openSymbols.has(order.instId)
    );

    console.log(`   👻 Ghost orders found: ${ghostOrders.length}`);

    if (ghostOrders.length === 0) {
      return { cleaned: 0, failed: 0, details: [] };
    }

    // Cancel ghost orders
    const details: Array<{ symbol: string; orderType: string; orderId: string; status: 'cancelled' | 'failed' }> = [];
    let cleaned = 0;
    let failed = 0;
    
    for (const order of ghostOrders) {
      try {
        console.log(`   🗑️ Cancelling ghost order: ${order.instId} (${order.algoId})`);
        
        const cancelData = await makeOkxRequestWithRetry(
          'POST',
          '/api/v5/trade/cancel-algos',
          credentials.apiKey,
          credentials.apiSecret,
          credentials.passphrase,
          credentials.demo,
          JSON.stringify([{
            algoId: order.algoId,
            instId: order.instId,
          }]),
          2
        );

        if (cancelData.code === '0') {
          console.log(`   ✅ Cancelled: ${order.instId}`);
          cleaned++;
          details.push({
            symbol: order.instId,
            orderType: order.slTriggerPx ? 'SL' : order.tpTriggerPx ? 'TP' : 'Unknown',
            orderId: order.algoId,
            status: 'cancelled'
          });
        } else {
          console.error(`   ❌ Failed to cancel ${order.instId}: ${cancelData.msg}`);
          failed++;
          details.push({
            symbol: order.instId,
            orderType: order.slTriggerPx ? 'SL' : order.tpTriggerPx ? 'TP' : 'Unknown',
            orderId: order.algoId,
            status: 'failed'
          });
        }
      } catch (error: any) {
        console.error(`   ❌ Error cancelling order:`, error.message);
        failed++;
        details.push({
          symbol: order.instId,
          orderType: order.slTriggerPx ? 'SL' : order.tpTriggerPx ? 'TP' : 'Unknown',
          orderId: order.algoId,
          status: 'failed'
        });
      }
    }

    return { cleaned, failed, details };
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to cleanup ghost orders:`, error.message);
    return { cleaned: 0, failed: 0, details: [] };
  }
}

// ============================================
// 🔄 CONFIRMATION SYSTEM
// ============================================

export async function requireConfirmation(
  positionId: number,
  action: string,
  checkData: any,
  requiredChecks: number
): Promise<boolean> {
  if (requiredChecks === 1) {
    // Instant action - no confirmation needed
    return true;
  }

  const key = `${positionId}-${action}`;
  const now = Date.now();
  const existing = confirmationTracking.get(key);

  if (!existing) {
    // First check - start tracking
    confirmationTracking.set(key, {
      positionId,
      action,
      count: 1,
      firstCheckTime: now,
      lastCheckData: checkData,
    });
    
    console.log(`   ⏳ [OKO] Confirmation 1/${requiredChecks} for ${action}`);
    return false;
  }

  // Check if too much time passed (reset if > 30 seconds)
  const timeSinceFirst = now - existing.firstCheckTime;
  if (timeSinceFirst > 30000) {
    console.log(`   ⚠️ [OKO] Confirmation expired (${timeSinceFirst}ms), resetting...`);
    confirmationTracking.set(key, {
      positionId,
      action,
      count: 1,
      firstCheckTime: now,
      lastCheckData: checkData,
    });
    return false;
  }

  // Increment count
  existing.count++;
  existing.lastCheckData = checkData;
  confirmationTracking.set(key, existing);

  console.log(`   ⏳ [OKO] Confirmation ${existing.count}/${requiredChecks} for ${action}`);

  if (existing.count >= requiredChecks) {
    // Confirmed! Clear tracking
    confirmationTracking.delete(key);
    console.log(`   ✅ [OKO] Action ${action} CONFIRMED (${requiredChecks} checks)`);
    return true;
  }

  return false;
}

// ============================================
// 📝 LOG OKO ACTION
// ============================================

export async function logOkoAction(
  positionId: number | null,
  symbol: string,
  action: string,
  reason: string,
  checkCount: number,
  metadata?: any
): Promise<void> {
  try {
    // Log to position_guard_actions
    await db.insert(positionGuardActions).values({
      positionId,
      actionType: action,
      reason,
      checkCount,
      createdAt: new Date().toISOString(),
      metadata: metadata ? JSON.stringify(metadata) : null,
    });

    // Log to position_guard_logs (more detailed)
    if (positionId) {
      await db.insert(positionGuardLogs).values({
        positionId,
        symbol,
        action,
        reason,
        confirmationCount: checkCount,
        pnlAtAction: metadata?.pnl || null,
        priceAtAction: metadata?.currentPrice || null,
        closePrice: metadata?.closePrice || null,
        settingsSnapshot: metadata?.settings ? JSON.stringify(metadata.settings) : null,
        createdAt: new Date().toISOString(),
      });
    }

    console.log(`   📝 [OKO] Logged action: ${action} for ${symbol}`);
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to log action:`, error.message);
  }
}

// ============================================
// 🚫 INCREMENT CAPITULATION COUNTER
// ============================================

export async function incrementCapitulationCounter(): Promise<number> {
  try {
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) return 0;

    const currentCounter = settings[0].okoCapitulationCounter || 0;
    const newCounter = currentCounter + 1;

    await db.update(botSettings)
      .set({
        okoCapitulationCounter: newCounter,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(botSettings.id, settings[0].id));

    console.log(`   📈 [OKO] Capitulation counter: ${currentCounter} → ${newCounter}`);
    return newCounter;
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to increment counter:`, error.message);
    return 0;
  }
}

// ============================================
// 🚫 BAN SYMBOL (CAPITULATION)
// ============================================

export async function banSymbol(
  symbol: string,
  reason: string,
  durationHours: number
): Promise<void> {
  try {
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0) return;

    // Parse existing banned symbols
    let bannedSymbols: Array<{ symbol: string; bannedAt: string; expiresAt: string; reason: string }> = [];
    
    if (settings[0].okoBannedSymbols) {
      try {
        bannedSymbols = JSON.parse(settings[0].okoBannedSymbols);
      } catch (e) {
        bannedSymbols = [];
      }
    }

    // Add new ban
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    
    bannedSymbols.push({
      symbol,
      bannedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason,
    });

    // Update settings
    await db.update(botSettings)
      .set({
        okoBannedSymbols: JSON.stringify(bannedSymbols),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(botSettings.id, settings[0].id));

    // Also add to symbol_locks table for visibility
    await db.insert(symbolLocks).values({
      symbol,
      lockReason: `oko_capitulation: ${reason}`,
      lockedAt: now.toISOString(),
      failureCount: 0,
      lastError: reason,
      isPermanent: false,
      createdAt: now.toISOString(),
    });

    console.log(`   🚫 [OKO] Symbol ${symbol} BANNED until ${expiresAt.toISOString()}`);
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to ban symbol:`, error.message);
  }
}

// ============================================
// 🆕 REPAIR ATTEMPT LIMITER
// ============================================

interface RepairAttempt {
  positionId: number;
  action: string;
  attemptCount: number;
  firstAttemptTime: number;
  lastAttemptTime: number;
}

const repairAttempts = new Map<string, RepairAttempt>();

export function shouldAttemptRepair(
  positionId: number,
  action: string,
  maxAttempts: number = 20,
  cooldownMinutes: number = 10
): boolean {
  const key = `${positionId}-${action}`;
  const now = Date.now();
  const existing = repairAttempts.get(key);

  if (!existing) {
    // First attempt
    repairAttempts.set(key, {
      positionId,
      action,
      attemptCount: 1,
      firstAttemptTime: now,
      lastAttemptTime: now,
    });
    console.log(`   🔧 [OKO] Repair attempt 1/${maxAttempts} for ${action}`);
    return true;
  }

  // Check if cooldown period has passed since first attempt
  const timeSinceFirst = now - existing.firstAttemptTime;
  const cooldownMs = cooldownMinutes * 60 * 1000;

  if (timeSinceFirst > cooldownMs) {
    // Reset after cooldown
    console.log(`   🔄 [OKO] Cooldown period passed, resetting repair attempts for ${action}`);
    repairAttempts.set(key, {
      positionId,
      action,
      attemptCount: 1,
      firstAttemptTime: now,
      lastAttemptTime: now,
    });
    return true;
  }

  // Check if max attempts reached
  if (existing.attemptCount >= maxAttempts) {
    console.log(`   ⛔ [OKO] Max repair attempts (${maxAttempts}) reached for ${action}. Wait ${cooldownMinutes} min.`);
    return false;
  }

  // Increment attempt count
  existing.attemptCount++;
  existing.lastAttemptTime = now;
  repairAttempts.set(key, existing);

  console.log(`   🔧 [OKO] Repair attempt ${existing.attemptCount}/${maxAttempts} for ${action}`);
  return true;
}

// ============================================
// 🆕 CLEAR REPAIR ATTEMPTS (after successful repair)
// ============================================

export function clearRepairAttempts(positionId: number, action: string): void {
  const key = `${positionId}-${action}`;
  repairAttempts.delete(key);
  console.log(`   ✅ [OKO] Cleared repair attempts for ${action}`);
}

// ============================================
// 🔍 CHECK IF SYMBOL IS BANNED
// ============================================

export async function isSymbolBanned(symbol: string): Promise<boolean> {
  try {
    const settings = await db.select().from(botSettings).limit(1);
    if (settings.length === 0 || !settings[0].okoBannedSymbols) return false;

    const bannedSymbols = JSON.parse(settings[0].okoBannedSymbols);
    const now = new Date();

    // Check if symbol is banned and not expired
    const activeBan = bannedSymbols.find((ban: any) => {
      return ban.symbol === symbol && new Date(ban.expiresAt) > now;
    });

    return !!activeBan;
  } catch (error: any) {
    console.error(`   ❌ [OKO] Failed to check ban status:`, error.message);
    return false;
  }
}

// ============================================
// 🎯 MAIN OKO GUARD FUNCTION (WITH FAZA 2 + 3)
// ============================================

export async function runOkoGuard(
  position: PositionData,
  allPositions: PositionData[],
  credentials?: OkxCredentials,
  okxPositions?: any[]
): Promise<OkoCheckResult> {
  try {
    console.log(`\n👁️ [OKO] Scanning position ${position.symbol}...`);

    // Get Oko settings
    const settings = await getOkoSettings();
    if (!settings || !settings.enabled) {
      console.log(`   ⚠️ [OKO] Disabled - skipping`);
      return {
        shouldClose: false,
        shouldFix: false,
        action: 'none',
        reason: 'Oko Saurona disabled',
        checkCount: 0,
      };
    }

    // Check if symbol is banned
    const isBanned = await isSymbolBanned(position.symbol);
    if (isBanned) {
      console.log(`   🚫 [OKO] Symbol ${position.symbol} is BANNED - skipping`);
      return {
        shouldClose: false,
        shouldFix: false,
        action: 'none',
        reason: 'Symbol banned by capitulation',
        checkCount: 0,
      };
    }

    // ============================================
    // 🆕 FAZA 3 - PRIORITY 0: GHOST POSITION CHECK (FIRST!)
    // ============================================
    
    if (okxPositions) {
      const ghostResult = await checkGhostPosition(position, okxPositions);
      if (ghostResult.shouldFix && ghostResult.action === 'ghost_position_cleanup') {
        console.log(`   👻 [OKO] GHOST POSITION DETECTED - cleanup needed`);
        
        await logOkoAction(
          position.id,
          position.symbol,
          'ghost_position_cleanup',
          ghostResult.reason,
          1,
          ghostResult.metadata
        );

        return ghostResult;
      }
    }

    // ============================================
    // PRIORITY 1: SL BREACH (instant - 1 check)
    // ============================================
    
    const slBreachResult = await checkSlBreach(position, settings);
    if (slBreachResult.shouldClose) {
      console.log(`   🚨 [OKO] SL BREACH DETECTED - INSTANT CLOSE`);
      
      // No confirmation needed for SL breach (1 check = instant)
      const confirmed = await requireConfirmation(
        position.id,
        'sl_breach',
        slBreachResult.metadata,
        1
      );

      if (confirmed) {
        await logOkoAction(
          position.id,
          position.symbol,
          'sl_breach',
          slBreachResult.reason,
          1,
          slBreachResult.metadata
        );

        return slBreachResult;
      }
    }

    // ============================================
    // PRIORITY 2: PNL EMERGENCY (3 checks)
    // ============================================
    
    const pnlResult = await checkPnlEmergency(position, settings);
    if (pnlResult.shouldClose) {
      console.log(`   🚨 [OKO] PNL EMERGENCY DETECTED`);
      
      // Requires 3 confirmations
      const confirmed = await requireConfirmation(
        position.id,
        'pnl_emergency',
        pnlResult.metadata,
        3
      );

      if (confirmed) {
        await logOkoAction(
          position.id,
          position.symbol,
          'pnl_emergency',
          pnlResult.reason,
          3,
          pnlResult.metadata
        );

        return pnlResult;
      }
    }

    // ============================================
    // 🆕 FAZA 2 - PRIORITY 3: MULTI-POSITION CORRELATION (3 checks)
    // ============================================
    
    const correlationResult = await checkMultiPositionCorrelation(position, allPositions);
    if (correlationResult.shouldClose) {
      console.log(`   🚨 [OKO] MULTI-POSITION CORRELATION DETECTED`);
      
      const confirmed = await requireConfirmation(
        position.id,
        'multi_position_correlation',
        correlationResult.metadata,
        3
      );

      if (confirmed) {
        await logOkoAction(
          position.id,
          position.symbol,
          'multi_position_correlation',
          correlationResult.reason,
          3,
          correlationResult.metadata
        );

        return correlationResult;
      }
    }

    // ============================================
    // PRIORITY 4: TIME-BASED EXIT (3 checks, optional)
    // ============================================
    
    const timeBasedResult = await checkTimeBasedExit(position, settings);
    if (timeBasedResult.shouldClose) {
      console.log(`   🚨 [OKO] TIME-BASED EXIT TRIGGERED`);
      
      const confirmed = await requireConfirmation(
        position.id,
        'time_based_exit',
        timeBasedResult.metadata,
        3
      );

      if (confirmed) {
        await logOkoAction(
          position.id,
          position.symbol,
          'time_based_exit',
          timeBasedResult.reason,
          3,
          timeBasedResult.metadata
        );

        return timeBasedResult;
      }
    }

    // ============================================
    // 🆕 FAZA 2 - CHECK REPAIRS (Missing SL/TP, TP1 Quantity)
    // ============================================
    
    if (credentials) {
      // Check Missing SL/TP (synchronized with OKX)
      const missingSlTpResult = await checkMissingSlTp(position, credentials);
      if (missingSlTpResult.shouldFix) {
        console.log(`   🔧 [OKO] Missing SL/TP detected - needs repair`);
        
        await logOkoAction(
          position.id,
          position.symbol,
          'missing_sl_tp',
          missingSlTpResult.reason,
          1,
          missingSlTpResult.metadata
        );

        return missingSlTpResult;
      }

      // Check TP1 Quantity Mismatch
      const tp1QuantityResult = await checkTp1QuantityMismatch(position, credentials);
      if (tp1QuantityResult.shouldFix) {
        console.log(`   🔧 [OKO] TP1 Quantity mismatch detected - needs fix`);
        
        await logOkoAction(
          position.id,
          position.symbol,
          'tp1_quantity_fix',
          tp1QuantityResult.reason,
          1,
          tp1QuantityResult.metadata
        );

        return tp1QuantityResult;
      }
    }

    // No action needed
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'none',
      reason: 'All checks passed',
      checkCount: 0,
    };

  } catch (error: any) {
    console.error(`   ❌ [OKO] Error scanning position:`, error.message);
    return {
      shouldClose: false,
      shouldFix: false,
      action: 'error',
      reason: error.message,
      checkCount: 0,
    };
  }
}

// ============================================
// 🌍 ACCOUNT-LEVEL OKO CHECK
// ============================================

export async function runAccountOkoGuard(
  allPositions: PositionData[]
): Promise<{ shouldCloseAll: boolean; reason: string }> {
  try {
    console.log(`\n👁️ [OKO] Checking account-level drawdown...`);

    const settings = await getOkoSettings();
    if (!settings || !settings.enabled) {
      return { shouldCloseAll: false, reason: 'Oko disabled' };
    }

    const result = await checkAccountDrawdown(allPositions, settings);
    
    if (result.shouldCloseAll) {
      console.log(`   🚨 [OKO] ACCOUNT DRAWDOWN EMERGENCY!`);
      
      // Requires 3 confirmations
      const confirmed = await requireConfirmation(
        -1, // Special ID for account-level checks
        'account_drawdown',
        { totalPnl: result.totalPnl, totalMargin: result.totalMargin },
        3
      );

      if (confirmed) {
        // Log account-level action
        await logOkoAction(
          null,
          'ALL',
          'account_drawdown',
          result.reason,
          3,
          {
            totalPnl: result.totalPnl,
            totalMargin: result.totalMargin,
            positionCount: allPositions.length,
          }
        );

        return {
          shouldCloseAll: true,
          reason: result.reason,
        };
      }
    }

    return { shouldCloseAll: false, reason: 'Account drawdown OK' };

  } catch (error: any) {
    console.error(`   ❌ [OKO] Error checking account:`, error.message);
    return { shouldCloseAll: false, reason: `Error: ${error.message}` };
  }
}

// ============================================
// 🔄 CLEAR OLD CONFIRMATIONS (cleanup)
// ============================================

export function clearOldConfirmations(): void {
  const now = Date.now();
  const expiryTime = 60000; // 1 minute

  for (const [key, state] of confirmationTracking.entries()) {
    if (now - state.firstCheckTime > expiryTime) {
      confirmationTracking.delete(key);
      console.log(`   🧹 [OKO] Cleared expired confirmation: ${key}`);
    }
  }
}