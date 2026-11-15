CREATE TABLE `circle_members` (
	`circle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY(`circle_id`, `user_id`),
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `circles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`log_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`is_spoiler` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `log_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`code` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_code_unique` ON `invites` (`code`);--> statement-breakpoint
CREATE TABLE `list_items` (
	`list_id` text NOT NULL,
	`media_entity_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`list_id`, `media_entity_id`),
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_entity_id`) REFERENCES `media_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`owner_user_id` text,
	`circle_id` text,
	`name` text NOT NULL,
	`is_ranked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`media_entity_id` text NOT NULL,
	`rating` real,
	`watched_on` integer,
	`platform` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_entity_id`) REFERENCES `media_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `log_watched_with` (
	`log_id` text NOT NULL,
	`member_user_id` text NOT NULL,
	PRIMARY KEY(`log_id`, `member_user_id`),
	FOREIGN KEY (`log_id`) REFERENCES `log_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `media_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`anilist_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`poster_path` text,
	`overview` text,
	`cached_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_entities_tmdb_id_unique` ON `media_entities` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);