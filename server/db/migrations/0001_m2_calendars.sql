CREATE TABLE `calendar_busy` (
	`connection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `calendar_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `busy_user_range` ON `calendar_busy` (`user_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `calendar_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`username` text,
	`password_enc` text,
	`calendars` text DEFAULT '[]' NOT NULL,
	`write_calendar_url` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`last_sync_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `calendar_ref` text;