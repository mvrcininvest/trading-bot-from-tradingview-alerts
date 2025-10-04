import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const alerts = sqliteTable('alerts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp').notNull(), // Unix timestamp from TradingView
  symbol: text('symbol', { length: 50 }).notNull(),
  side: text('side', { length: 10 }).notNull(), // BUY/SELL
  tier: text('tier', { length: 20 }).notNull(), // Platinum/Premium/Standard/Quick/Emergency
  tierNumeric: integer('tier_numeric').notNull(), // 1-5
  strength: real('strength').notNull(), // 0.000-1.000
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
  institutionalFlow: real('institutional_flow'), // nullable
  accumulation: real('accumulation'), // nullable
  volumeClimax: integer('volume_climax', { mode: 'boolean' }), // nullable
  latency: integer('latency').notNull(), // milliseconds from tv_ts to received
  rawJson: text('raw_json').notNull(), // full JSON alert
  createdAt: text('created_at').notNull(),
});