CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`scope` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`client` text,
	`action` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_at` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`manage_token` text NOT NULL,
	`event_type_id` text NOT NULL,
	`host_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`buffer_before` integer DEFAULT 0 NOT NULL,
	`buffer_after` integer DEFAULT 0 NOT NULL,
	`guest_name` text NOT NULL,
	`guest_email` text NOT NULL,
	`guest_timezone` text NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`answers` text DEFAULT '[]' NOT NULL,
	`location` text NOT NULL,
	`status` text NOT NULL,
	`cancel_reason` text,
	`cancelled_by` text,
	`sequence` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_via` text DEFAULT 'web' NOT NULL,
	`anonymized_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`event_type_id`) REFERENCES `event_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_manage_token_unique` ON `bookings` (`manage_token`);--> statement-breakpoint
CREATE INDEX `bookings_host_start` ON `bookings` (`host_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `bookings_email` ON `bookings` (`guest_email`);--> statement-breakpoint
CREATE TABLE `event_types` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`schedule_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`duration` integer NOT NULL,
	`location` text NOT NULL,
	`color` integer DEFAULT 172 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`requires_confirmation` integer DEFAULT false NOT NULL,
	`min_notice_minutes` integer DEFAULT 720 NOT NULL,
	`window_days` integer DEFAULT 60 NOT NULL,
	`buffer_before` integer DEFAULT 0 NOT NULL,
	`buffer_after` integer DEFAULT 0 NOT NULL,
	`slot_step` integer DEFAULT 30 NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`reminders` text DEFAULT '[1440,60]' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_types_user_slug` ON `event_types` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`run_at` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`dedupe_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_dedupe_key_unique` ON `jobs` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `jobs_due` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`transports` text DEFAULT '[]' NOT NULL,
	`name` text NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pending_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`preview` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`title` text NOT NULL,
	`from_date` text NOT NULL,
	`to_date` text NOT NULL,
	`kind` text NOT NULL,
	`hours` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exceptions_schedule_idx` ON `schedule_exceptions` (`schedule_id`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`timezone` text NOT NULL,
	`weekly` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`pending_second_factor` integer DEFAULT false NOT NULL,
	`user_agent` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`password_hash` text NOT NULL,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`timezone` text DEFAULT 'Europe/Berlin' NOT NULL,
	`locale` text DEFAULT 'de' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);