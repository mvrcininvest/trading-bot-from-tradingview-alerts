import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';

export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp').notNull(),
  symbol: text('symbol', { length: 50 }).notNull(),
  side: text('side', { length: 10 }).notNull(),
  tier: text('tier', { length: 20 }).notNull(),
  tierNumeric: integer('tier_numeric').notNull(),
  strength: real('strength').notNull(),
  entryPrice: real('entry_price').notNull(),
  sl: real('sl').notNull(),
  tp1: real('tp1').notNull(),
  tp2: real('tp2').notNull(),
  tp3: real('tp3').notNull(),
  mainTp: real('main_tp').notNull(),
  atr: real('atr').notNull(),
  volumeRatio: real('volume_ratio').notNull(),
  session: text('session', { length: 50 }).notNull(),
  regime: text('regime', { length: 50 }).notNull(),
  regimeConfidence: real('regime_confidence').notNull(),
  mtfAgreement: real('mtf_agreement').notNull(),
  leverage: integer('leverage').notNull(),
  inOb: integer('in_ob', { mode: 'boolean' }).notNull(),
  inFvg: integer('in_fvg', { mode: 'boolean' }).notNull(),
  obScore: real('ob_score').notNull(),
  fvgScore: real('fvg_score').notNull(),
  institutionalFlow: real('institutional_flow'),
  accumulation: real('accumulation'),
  volumeClimax: integer('volume_climax', { mode: 'boolean' }),
  latency: integer('latency').notNull(),
  rawJson: text('raw_json').notNull(),
  executionStatus: text('execution_status').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  errorType: text('error_type'),
  retentionDays: integer('retention_days').notNull().default(30),
  createdAt: text('created_at').notNull(),
});

export const botSettings = sqliteTable('bot_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  botEnabled: integer('bot_enabled', { mode: 'boolean' }).notNull().default(false),
  positionSizeMode: text('position_size_mode').notNull().default('percent'),
  positionSizePercent: real('position_size_percent').notNull().default(2.0),
  positionSizeFixed: real('position_size_fixed').notNull().default(100.0),
  leverageMode: text('leverage_mode').notNull().default('from_alert'),
  leverageFixed: integer('leverage_fixed').notNull().default(10),
  tierFilteringMode: text('tier_filtering_mode').notNull().default('all'),
  disabledTiers: text('disabled_tiers').notNull().default('[]'),
  tpStrategy: text('tp_strategy').notNull().default('multiple'),
  tpMode: text('tp_mode').notNull().default('percent'),
  maxConcurrentPositions: integer('max_concurrent_positions').notNull().default(10),
  sameSymbolBehavior: text('same_symbol_behavior').notNull().default('track_confirmations'),
  oppositeDirectionStrategy: text('opposite_direction_strategy').notNull().default('market_reversal'),
  reversalWaitBars: integer('reversal_wait_bars').notNull().default(1),
  reversalMinStrength: real('reversal_min_strength').notNull().default(0.25),
  emergencyCanReverse: integer('emergency_can_reverse', { mode: 'boolean' }).notNull().default(true),
  emergencyOverrideMode: text('emergency_override_mode').notNull().default('only_profit'),
  emergencyMinProfitPercent: real('emergency_min_profit_percent').notNull().default(0.0),
  useDefaultSlTp: integer('use_default_sl_tp', { mode: 'boolean' }).notNull().default(false),
  defaultSlRR: real('default_sl_rr').notNull().default(1.0),
  defaultTp1RR: real('default_tp1_rr').notNull().default(1.0),
  defaultTp2RR: real('default_tp2_rr').notNull().default(2.0),
  defaultTp3RR: real('default_tp3_rr').notNull().default(3.0),
  tpCount: integer('tp_count').notNull().default(3),
  tp1RR: real('tp1_rr').notNull().default(1.0),
  tp1Percent: real('tp1_percent').notNull().default(50.0),
  tp2RR: real('tp2_rr').notNull().default(2.0),
  tp2Percent: real('tp2_percent').notNull().default(30.0),
  tp3RR: real('tp3_rr').notNull().default(3.0),
  tp3Percent: real('tp3_percent').notNull().default(20.0),
  slManagementAfterTp1: text('sl_management_after_tp1').notNull().default('breakeven'),
  slTrailingDistance: real('sl_trailing_distance').notNull().default(0.5),
  adaptiveRR: integer('adaptive_rr', { mode: 'boolean' }).notNull().default(false),
  adaptiveMultiplier: real('adaptive_multiplier').notNull().default(1.5),
  adaptiveStrengthThreshold: real('adaptive_strength_threshold').notNull().default(0.5),
  slAsMarginPercent: integer('sl_as_margin_percent', { mode: 'boolean' }).notNull().default(false),
  slMarginRiskPercent: real('sl_margin_risk_percent').notNull().default(2.0),
  
  // Oko Saurona Settings
  okoEnabled: integer('oko_enabled', { mode: 'boolean' }).notNull().default(false),
  okoAccountDrawdownThreshold: integer('oko_account_drawdown_threshold').notNull().default(50),
  okoCapitulationThreshold: integer('oko_capitulation_threshold').notNull().default(3),
  okoBanDurationHours: integer('oko_ban_duration_hours').notNull().default(24),
  okoTimeBasedExitHours: integer('oko_time_based_exit_hours').notNull().default(24),
  okoTimeBasedExitEnabled: integer('oko_time_based_exit_enabled', { mode: 'boolean' }).notNull().default(false),
  okoCapitulationCounter: integer('oko_capitulation_counter').notNull().default(0),
  okoBannedSymbols: text('oko_banned_symbols'),
  
  apiKey: text('api_key'),
  apiSecret: text('api_secret'),
  passphrase: text('passphrase'),
  exchange: text('exchange').notNull().default('bybit'),
  environment: text('environment').notNull().default('mainnet'),
  migrationDate: text('migration_date'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const botPositions = sqliteTable('bot_positions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  alertId: integer('alert_id').references(() => alerts.id),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  tier: text('tier').notNull(),
  entryPrice: real('entry_price').notNull(),
  quantity: real('quantity').notNull(),
  leverage: integer('leverage').notNull(),
  stopLoss: real('stop_loss').notNull(),
  tp1Price: real('tp1_price'),
  tp2Price: real('tp2_price'),
  tp3Price: real('tp3_price'),
  mainTpPrice: real('main_tp_price').notNull(),
  tp1Hit: integer('tp1_hit', { mode: 'boolean' }).notNull().default(false),
  tp2Hit: integer('tp2_hit', { mode: 'boolean' }).notNull().default(false),
  tp3Hit: integer('tp3_hit', { mode: 'boolean' }).notNull().default(false),
  currentSl: real('current_sl').notNull(),
  positionValue: real('position_value').notNull(),
  initialMargin: real('initial_margin').notNull(),
  unrealisedPnl: real('unrealised_pnl').notNull().default(0.0),
  confirmationCount: integer('confirmation_count').notNull().default(1),
  confidenceScore: real('confidence_score').notNull(),
  openedAt: text('opened_at').notNull(),
  lastUpdated: text('last_updated').notNull(),
  bybitOrderId: text('bybit_order_id'),
  tp2OrderId: text('tp2_order_id'),
  tp3OrderId: text('tp3_order_id'),
  closedAt: text('closed_at'),
  closeReason: text('close_reason'),
  status: text('status').notNull().default('open'),
  alertData: text('alert_data'),
  receivedAt: text('received_at'),
});

export const botActions = sqliteTable('bot_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  actionType: text('action_type').notNull(),
  symbol: text('symbol'),
  side: text('side'),
  tier: text('tier'),
  alertId: integer('alert_id').references(() => alerts.id),
  positionId: integer('position_id').references(() => botPositions.id),
  reason: text('reason').notNull(),
  details: text('details'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
});

export const positionHistory = sqliteTable('position_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').references(() => botPositions.id),
  alertId: integer('alert_id').references(() => alerts.id),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  tier: text('tier').notNull(),
  entryPrice: real('entry_price').notNull(),
  closePrice: real('close_price').notNull(),
  quantity: real('quantity').notNull(),
  leverage: integer('leverage').notNull(),
  pnl: real('pnl').notNull(),
  grossPnl: real('gross_pnl'),
  tradingFees: real('trading_fees'),
  fundingFees: real('funding_fees'),
  totalFees: real('total_fees'),
  pnlPercent: real('pnl_percent').notNull(),
  closeReason: text('close_reason').notNull(),
  tp1Hit: integer('tp1_hit', { mode: 'boolean' }).notNull().default(false),
  tp2Hit: integer('tp2_hit', { mode: 'boolean' }).notNull().default(false),
  tp3Hit: integer('tp3_hit', { mode: 'boolean' }).notNull().default(false),
  partialCloseCount: integer('partial_close_count'),
  confirmationCount: integer('confirmation_count').notNull().default(1),
  openedAt: text('opened_at').notNull(),
  closedAt: text('closed_at').notNull(),
  durationMinutes: integer('duration_minutes'),
  alertData: text('alert_data'),
});

export const botLogs = sqliteTable('bot_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp').notNull(),
  level: text('level', { length: 20 }).notNull(), // error, warning, info, success
  action: text('action', { length: 100 }).notNull(), // webhook_received, position_opened, etc.
  message: text('message').notNull(),
  details: text('details'), // JSON string with additional data
  alertId: integer('alert_id').references(() => alerts.id),
  positionId: integer('position_id').references(() => botPositions.id),
  createdAt: integer('created_at').notNull(),
});

export const symbolLocks = sqliteTable('symbol_locks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  lockReason: text('lock_reason').notNull(),
  lockedAt: text('locked_at').notNull(),
  failureCount: integer('failure_count').notNull(),
  lastError: text('last_error'),
  unlockedAt: text('unlocked_at'),
  isPermanent: integer('is_permanent', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  symbolIdx: index('idx_symbol_locks_symbol').on(table.symbol),
}));

export const diagnosticFailures = sqliteTable('diagnostic_failures', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').references(() => botPositions.id),
  failureType: text('failure_type').notNull(),
  reason: text('reason').notNull(),
  attemptCount: integer('attempt_count').notNull(),
  errorDetails: text('error_details'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  positionIdx: index('idx_diagnostic_failures_position').on(table.positionId),
}));

export const tpslRetryAttempts = sqliteTable('tpsl_retry_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').notNull().references(() => botPositions.id),
  attemptNumber: integer('attempt_number').notNull(),
  orderType: text('order_type').notNull(),
  triggerPrice: real('trigger_price').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  errorType: text('error_type'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  positionIdx: index('idx_tpsl_retry_position').on(table.positionId),
}));

export const activePositionTracking = sqliteTable('active_position_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),
  positionId: integer('position_id').references(() => botPositions.id),
  status: text('status').notNull(),
  trackedAt: text('tracked_at').notNull(),
  completedAt: text('completed_at'),
}, (table) => ({
  symbolStatusIdx: index('idx_active_position_tracking_symbol_status').on(table.symbol, table.status),
}));

export const positionConflictLog = sqliteTable('position_conflict_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  alertId: integer('alert_id').notNull().references(() => alerts.id),
  existingPositionId: integer('existing_position_id').references(() => botPositions.id),
  symbol: text('symbol').notNull(),
  newSide: text('new_side').notNull(),
  existingSide: text('existing_side'),
  newTier: text('new_tier').notNull(),
  existingTier: text('existing_tier'),
  conflictType: text('conflict_type').notNull(),
  resolution: text('resolution').notNull(),
  resolvedAt: text('resolved_at').notNull(),
  reason: text('reason').notNull(),
}, (table) => ({
  alertIdIdx: index('idx_position_conflict_log_alert').on(table.alertId),
  symbolResolvedIdx: index('idx_position_conflict_log_symbol_resolved').on(table.symbol, table.resolvedAt),
}));

export const botDetailedLogs = sqliteTable('bot_detailed_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').references(() => botPositions.id),
  alertId: integer('alert_id').references(() => alerts.id),
  actionType: text('action_type').notNull(), // 'open_position', 'set_sl', 'set_tp', 'modify_sl', 'modify_tp', 'close_position'
  stage: text('stage').notNull(), // 'request', 'exchange_response', 'verification'
  
  // Planned values (from bot)
  plannedSymbol: text('planned_symbol'),
  plannedSide: text('planned_side'),
  plannedQuantity: real('planned_quantity'),
  plannedEntryPrice: real('planned_entry_price'),
  plannedSlPrice: real('planned_sl_price'),
  plannedTp1Price: real('planned_tp1_price'),
  plannedTp2Price: real('planned_tp2_price'),
  plannedTp3Price: real('planned_tp3_price'),
  plannedLeverage: integer('planned_leverage'),
  plannedMargin: real('planned_margin'),
  
  // Actual values (from exchange)
  actualSymbol: text('actual_symbol'),
  actualSide: text('actual_side'),
  actualQuantity: real('actual_quantity'),
  actualEntryPrice: real('actual_entry_price'),
  actualSlPrice: real('actual_sl_price'),
  actualTp1Price: real('actual_tp1_price'),
  actualTp2Price: real('actual_tp2_price'),
  actualTp3Price: real('actual_tp3_price'),
  actualLeverage: integer('actual_leverage'),
  actualMargin: real('actual_margin'),
  
  // Verification
  hasDiscrepancy: integer('has_discrepancy', { mode: 'boolean' }).notNull(),
  discrepancyDetails: text('discrepancy_details'), // JSON array of discrepancies
  discrepancyThreshold: real('discrepancy_threshold'), // e.g., 0.005 for 0.5%
  
  // Settings snapshot (JSON)
  settingsSnapshot: text('settings_snapshot'), // Complete bot_settings at time of action
  
  // Exchange metadata
  orderId: text('order_id'),
  algoOrderId: text('algo_order_id'),
  exchangeResponse: text('exchange_response'), // Full response from exchange
  
  // Timestamps
  timestamp: text('timestamp').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  positionIdx: index('idx_bot_detailed_logs_position').on(table.positionId),
  alertIdx: index('idx_bot_detailed_logs_alert').on(table.alertId),
  discrepancyIdx: index('idx_bot_detailed_logs_discrepancy').on(table.hasDiscrepancy),
}));

export const positionGuardLogs = sqliteTable('position_guard_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').references(() => botPositions.id),
  symbol: text('symbol').notNull(),
  action: text('action').notNull(), // 'pnl_emergency', 'sl_breach', 'fix_sltp', 'tp1_quantity_fix', 'trailing_sl', 'breakeven', 'capitulation', 'account_drawdown'
  reason: text('reason').notNull(),
  confirmationCount: integer('confirmation_count').notNull(),
  pnlAtAction: real('pnl_at_action'),
  priceAtAction: real('price_at_action'),
  closePrice: real('close_price'),
  settingsSnapshot: text('settings_snapshot'), // JSON snapshot of relevant oko settings
  createdAt: text('created_at').notNull(),
}, (table) => ({
  positionIdx: index('idx_position_guard_logs_position').on(table.positionId),
  symbolIdx: index('idx_position_guard_logs_symbol').on(table.symbol),
  actionIdx: index('idx_position_guard_logs_action').on(table.action),
}));

export const positionGuardActions = sqliteTable('position_guard_actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  positionId: integer('position_id').references(() => botPositions.id),
  actionType: text('action_type').notNull(),
  reason: text('reason').notNull(),
  checkCount: integer('check_count').notNull(),
  createdAt: text('created_at').notNull(),
  metadata: text('metadata'),
}, (table) => ({
  positionIdx: index('idx_position_guard_actions_position').on(table.positionId),
  actionTypeIdx: index('idx_position_guard_actions_type').on(table.actionType),
}));

export const capitulationCounter = sqliteTable('capitulation_counter', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  closureCount: integer('closure_count').notNull().default(0),
  lastResetAt: text('last_reset_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});