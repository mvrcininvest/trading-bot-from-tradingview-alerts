import { db } from "@/db";
import { botPositions, activePositionTracking, positionConflictLog } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface Alert {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  tierNumeric: number;
  strength: number;
  [key: string]: any;
}

export interface BotSettings {
  sameSymbolBehavior: string;
  oppositeDirectionStrategy: string;
  reversalWaitBars: number;
  reversalMinStrength: number;
  emergencyCanReverse: boolean;
  emergencyOverrideMode: string;
  emergencyMinProfitPercent: number;
  [key: string]: any;
}

export interface ExistingPosition {
  id: number;
  symbol: string;
  side: string;
  tier: string;
  tierNumeric?: number;
  unrealisedPnl: number;
  initialMargin: number;
  confirmationCount: number;
  confidenceScore: number;
  [key: string]: any;
}

export type ConflictType = "REVERSE" | "UPGRADE" | "SAME_DIRECTION" | "NONE";
export type ConflictResolution = "REJECT" | "CLOSE_AND_OPEN" | "IGNORE" | "UPGRADE";

export interface ConflictAnalysis {
  hasConflict: boolean;
  conflictType: ConflictType;
  resolution: ConflictResolution;
  reason: string;
  shouldProceed: boolean;
  existingPosition?: ExistingPosition;
}

/**
 * 🔍 Check if symbol is currently being opened (race condition prevention)
 */
export async function isSymbolBeingOpened(symbol: string, side: string): Promise<boolean> {
  const tracking = await db
    .select()
    .from(activePositionTracking)
    .where(
      and(
        eq(activePositionTracking.symbol, symbol),
        eq(activePositionTracking.side, side),
        eq(activePositionTracking.status, "opening")
      )
    )
    .limit(1);

  return tracking.length > 0;
}

/**
 * 🔒 Lock symbol for opening (transaction safety)
 */
export async function lockSymbolForOpening(symbol: string, side: string): Promise<number> {
  const result = await db
    .insert(activePositionTracking)
    .values({
      symbol,
      side,
      positionId: null,
      status: "opening",
      trackedAt: new Date().toISOString(),
      completedAt: null,
    })
    .returning({ id: activePositionTracking.id });

  return result[0].id;
}

/**
 * ✅ Mark position opening as complete
 */
export async function markPositionOpened(trackingId: number, positionId: number): Promise<void> {
  await db
    .update(activePositionTracking)
    .set({
      positionId,
      status: "active",
      completedAt: new Date().toISOString(),
    })
    .where(eq(activePositionTracking.id, trackingId));
}

/**
 * ❌ Mark position opening as failed
 */
export async function markPositionOpenFailed(trackingId: number): Promise<void> {
  await db
    .update(activePositionTracking)
    .set({
      status: "closed",
      completedAt: new Date().toISOString(),
    })
    .where(eq(activePositionTracking.id, trackingId));
}

/**
 * 🔍 Get existing open position for symbol
 */
export async function getExistingPosition(symbol: string): Promise<ExistingPosition | null> {
  const positions = await db
    .select()
    .from(botPositions)
    .where(
      and(
        eq(botPositions.symbol, symbol),
        eq(botPositions.status, "open")
      )
    )
    .limit(1);

  if (positions.length === 0) return null;
  return positions[0] as ExistingPosition;
}

/**
 * 📊 Determine conflict type
 */
function determineConflictType(
  newAlert: Alert,
  existingPosition: ExistingPosition | null
): ConflictType {
  if (!existingPosition) return "NONE";

  const newSide = newAlert.side.toUpperCase();
  const existingSide = existingPosition.side.toUpperCase();

  // Opposite direction (LONG vs SHORT)
  if (newSide !== existingSide) {
    return "REVERSE";
  }

  // Same direction - check tier
  const newTier = newAlert.tierNumeric || 0;
  const existingTier = existingPosition.tierNumeric || 0;

  if (newTier > existingTier) {
    return "UPGRADE";
  }

  return "SAME_DIRECTION";
}

/**
 * 🎯 Resolve REVERSE conflict
 */
function resolveReverse(
  newAlert: Alert,
  existingPosition: ExistingPosition,
  config: BotSettings
): { resolution: ConflictResolution; reason: string } {
  const strategy = config.oppositeDirectionStrategy;

  if (strategy === "reject") {
    return {
      resolution: "REJECT",
      reason: `Rejected: Already in ${existingPosition.side} position, opposite direction not allowed`,
    };
  }

  if (strategy === "market_reversal") {
    // Check minimum strength
    if (newAlert.strength < config.reversalMinStrength) {
      return {
        resolution: "REJECT",
        reason: `Rejected: Reversal strength ${newAlert.strength.toFixed(2)} below minimum ${config.reversalMinStrength}`,
      };
    }

    // Check if Emergency tier can reverse
    if (newAlert.tier === "Emergency" && !config.emergencyCanReverse) {
      return {
        resolution: "REJECT",
        reason: "Rejected: Emergency tier cannot trigger reversal",
      };
    }

    // Check PnL requirements for Emergency override
    if (newAlert.tier === "Emergency" && config.emergencyOverrideMode === "only_profit") {
      const pnlPercent = (existingPosition.unrealisedPnl / existingPosition.initialMargin) * 100;
      if (pnlPercent < config.emergencyMinProfitPercent) {
        return {
          resolution: "REJECT",
          reason: `Rejected: Emergency override requires ${config.emergencyMinProfitPercent}% profit, current: ${pnlPercent.toFixed(2)}%`,
        };
      }
    }

    // All checks passed - close and reverse
    return {
      resolution: "CLOSE_AND_OPEN",
      reason: `Market reversal: Closing ${existingPosition.side} to open ${newAlert.side} (strength: ${newAlert.strength.toFixed(2)})`,
    };
  }

  return {
    resolution: "REJECT",
    reason: "Unknown opposite direction strategy",
  };
}

/**
 * 📈 Resolve UPGRADE conflict
 */
function resolveUpgrade(
  newAlert: Alert,
  existingPosition: ExistingPosition,
  config: BotSettings
): { resolution: ConflictResolution; reason: string } {
  const behavior = config.sameSymbolBehavior;

  if (behavior === "reject_duplicates") {
    return {
      resolution: "REJECT",
      reason: `Rejected: Position already exists (${existingPosition.tier}), duplicates not allowed`,
    };
  }

  if (behavior === "track_confirmations") {
    // Increment confirmation count (handled by webhook)
    return {
      resolution: "UPGRADE",
      reason: `Upgrade: Increasing confirmation from ${existingPosition.confirmationCount} → ${existingPosition.confirmationCount + 1}`,
    };
  }

  if (behavior === "tier_based") {
    return {
      resolution: "UPGRADE",
      reason: `Upgrade: ${existingPosition.tier} → ${newAlert.tier} (higher tier detected)`,
    };
  }

  return {
    resolution: "REJECT",
    reason: "Unknown same symbol behavior",
  };
}

/**
 * 🔄 Resolve SAME_DIRECTION conflict
 */
function resolveSameDirection(
  newAlert: Alert,
  existingPosition: ExistingPosition,
  config: BotSettings
): { resolution: ConflictResolution; reason: string } {
  const behavior = config.sameSymbolBehavior;

  if (behavior === "reject_duplicates") {
    return {
      resolution: "REJECT",
      reason: `Rejected: Position already exists (${existingPosition.tier}), same direction not allowed`,
    };
  }

  if (behavior === "track_confirmations") {
    return {
      resolution: "UPGRADE",
      reason: `Confirmation: Increasing count from ${existingPosition.confirmationCount} → ${existingPosition.confirmationCount + 1}`,
    };
  }

  return {
    resolution: "IGNORE",
    reason: `Ignored: Position already exists, same tier ${existingPosition.tier}`,
  };
}

/**
 * 🔍 Main conflict resolution function
 */
export async function resolveConflict(
  newAlert: Alert,
  config: BotSettings
): Promise<ConflictAnalysis> {
  // Check if already being opened (race condition)
  const isOpening = await isSymbolBeingOpened(newAlert.symbol, newAlert.side);
  if (isOpening) {
    return {
      hasConflict: true,
      conflictType: "NONE",
      resolution: "REJECT",
      reason: "Rejected: Position is currently being opened (race condition prevention)",
      shouldProceed: false,
    };
  }

  // Check for existing position
  const existingPosition = await getExistingPosition(newAlert.symbol);

  // No conflict - proceed
  if (!existingPosition) {
    return {
      hasConflict: false,
      conflictType: "NONE",
      resolution: "IGNORE",
      reason: "No conflict: No existing position found",
      shouldProceed: true,
    };
  }

  // Determine conflict type
  const conflictType = determineConflictType(newAlert, existingPosition);

  let resolution: ConflictResolution;
  let reason: string;

  // Resolve based on conflict type
  switch (conflictType) {
    case "REVERSE":
      ({ resolution, reason } = resolveReverse(newAlert, existingPosition, config));
      break;

    case "UPGRADE":
      ({ resolution, reason } = resolveUpgrade(newAlert, existingPosition, config));
      break;

    case "SAME_DIRECTION":
      ({ resolution, reason } = resolveSameDirection(newAlert, existingPosition, config));
      break;

    default:
      resolution = "REJECT";
      reason = "Unknown conflict type";
  }

  // Log conflict to database
  await db.insert(positionConflictLog).values({
    alertId: newAlert.id,
    existingPositionId: existingPosition.id,
    symbol: newAlert.symbol,
    newSide: newAlert.side,
    existingSide: existingPosition.side,
    newTier: newAlert.tier,
    existingTier: existingPosition.tier,
    conflictType,
    resolution,
    resolvedAt: new Date().toISOString(),
    reason,
  });

  // Determine if should proceed
  const shouldProceed = resolution === "CLOSE_AND_OPEN" || resolution === "UPGRADE";

  return {
    hasConflict: true,
    conflictType,
    resolution,
    reason,
    shouldProceed,
    existingPosition,
  };
}

/**
 * 🧹 Cleanup completed tracking entries (maintenance)
 */
export async function cleanupCompletedTracking(olderThanHours: number = 24): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - olderThanHours);

  const result = await db
    .delete(activePositionTracking)
    .where(
      and(
        eq(activePositionTracking.status, "closed"),
        // Note: This is a simple comparison, may need adjustment based on your date format
      )
    );

  return result.rowsAffected || 0;
}
