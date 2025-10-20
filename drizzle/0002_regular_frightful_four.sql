ALTER TABLE `bot_settings` ADD `use_default_sl_tp` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `default_sl_percent` real DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `default_tp1_percent` real DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `default_tp2_percent` real DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `default_tp3_percent` real DEFAULT 6 NOT NULL;