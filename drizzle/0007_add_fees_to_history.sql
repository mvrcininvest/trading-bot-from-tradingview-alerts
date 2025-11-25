-- Add fee tracking columns to position_history table
-- Migration: 0007_add_fees_to_history
-- Created: 2025-11-25

-- Add new columns for fee tracking
ALTER TABLE `position_history` ADD `gross_pnl` real;
ALTER TABLE `position_history` ADD `trading_fees` real DEFAULT 0 NOT NULL;
ALTER TABLE `position_history` ADD `funding_fees` real DEFAULT 0 NOT NULL;
ALTER TABLE `position_history` ADD `total_fees` real DEFAULT 0 NOT NULL;
ALTER TABLE `position_history` ADD `partial_close_count` integer DEFAULT 1 NOT NULL;

-- Backfill existing records: set grossPnl = pnl (no historical fee data available)
UPDATE `position_history` SET `gross_pnl` = `pnl` WHERE `gross_pnl` IS NULL;
UPDATE `position_history` SET `trading_fees` = 0 WHERE `trading_fees` IS NULL;
UPDATE `position_history` SET `funding_fees` = 0 WHERE `funding_fees` IS NULL;
UPDATE `position_history` SET `total_fees` = 0 WHERE `total_fees` IS NULL;
UPDATE `position_history` SET `partial_close_count` = 1 WHERE `partial_close_count` IS NULL;
