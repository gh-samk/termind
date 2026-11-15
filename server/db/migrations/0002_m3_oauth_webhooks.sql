CREATE TABLE `oauth_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirect_uris` text NOT NULL,
	`kind` text DEFAULT 'dcr' NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`user_id` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`code_challenge` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `oauth_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`client_name` text NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`resource` text,
	`access_hash` text NOT NULL,
	`access_expires_at` text NOT NULL,
	`refresh_hash` text,
	`refresh_expires_at` text,
	`revoked_at` text,
	`last_used_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_access_hash_unique` ON `oauth_grants` (`access_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_grants_refresh_hash_unique` ON `oauth_grants` (`refresh_hash`);--> statement-breakpoint
CREATE INDEX `grants_user` ON `oauth_grants` (`user_id`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event` text NOT NULL,
	`status_code` integer,
	`ok` integer NOT NULL,
	`error` text,
	`attempt` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deliveries_hook` ON `webhook_deliveries` (`webhook_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`url` text NOT NULL,
	`secret_enc` text NOT NULL,
	`events` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
