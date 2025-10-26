ALTER TABLE `alerts` ADD `execution_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `alerts` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `bot_positions` ADD `tp2_order_id` text;--> statement-breakpoint
ALTER TABLE `bot_positions` ADD `tp3_order_id` text;--> statement-breakpoint
ALTER TABLE `bot_positions` ADD `closed_at` text;--> statement-breakpoint
ALTER TABLE `bot_positions` ADD `close_reason` text;