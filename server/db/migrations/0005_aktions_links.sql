CREATE TABLE `action_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`booking_sequence` integer NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `action_tokens_booking_idx` ON `action_tokens` (`booking_id`);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `notify_guest` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `bookings` ADD `guest_moves` integer DEFAULT 0 NOT NULL;
