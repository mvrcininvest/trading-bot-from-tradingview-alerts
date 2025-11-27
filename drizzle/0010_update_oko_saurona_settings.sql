-- Add missing Oko Saurona columns to bot_settings table
ALTER TABLE `bot_settings` ADD `oko_check_frequency_seconds` integer DEFAULT 5 NOT NULL;
ALTER TABLE `bot_settings` ADD `oko_account_drawdown_percent` real DEFAULT 50.0 NOT NULL;
ALTER TABLE `bot_settings` ADD `oko_account_drawdown_close_all` integer DEFAULT 1 NOT NULL;
ALTER TABLE `bot_settings` ADD `oko_account_drawdown_checks` integer DEFAULT 3 NOT NULL;
ALTER TABLE `bot_settings` ADD `oko_capitulation_ban_duration_hours` integer DEFAULT 6 NOT NULL;
ALTER TABLE `bot_settings` ADD `oko_capitulation_checks` integer DEFAULT 1 NOT NULL;

-- Drop old unused Oko Saurona columns
ALTER TABLE `bot_settings` DROP COLUMN `oko_account_drawdown_threshold`;
ALTER TABLE `bot_settings` DROP COLUMN `oko_ban_duration_hours`;
ALTER TABLE `bot_settings` DROP COLUMN `oko_capitulation_threshold`;
