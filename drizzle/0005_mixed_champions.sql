ALTER TABLE `bot_settings` ADD `api_key` text;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `api_secret` text;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `exchange` text DEFAULT 'bybit' NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_settings` ADD `environment` text DEFAULT 'demo' NOT NULL;