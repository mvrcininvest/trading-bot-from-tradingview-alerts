CREATE TABLE `bot_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`level` text(20) NOT NULL,
	`action` text(100) NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`alert_id` integer,
	`position_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `bot_positions`(`id`) ON UPDATE no action ON DELETE no action
);
