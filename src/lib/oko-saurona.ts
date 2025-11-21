import { db } from '@/db';
import { botSettings, botPositions, positionGuardActions, positionGuardLogs, symbolLocks } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
// 🎯 MAIN OKO GUARD FUNCTION
// ============================================

export async function runOkoGuard(
  position: PositionData,
  allPositions: PositionData[]
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
    // PRIORITY 3: TIME-BASED EXIT (3 checks, optional)
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
