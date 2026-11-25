CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `circle` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `circle_invite_code_unique` ON `circle` (`invite_code`);--> statement-breakpoint
CREATE TABLE `circle_member` (
	`circle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`circle_id`, `user_id`),
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `circle_member` (`user_id`);--> statement-breakpoint
CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`log_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`is_spoiler` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`log_id`) REFERENCES `log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comment_log_idx` ON `comment` (`log_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `list` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text,
	`owner_id` text NOT NULL,
	`kind` text DEFAULT 'list' NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `list_circle_idx` ON `list` (`circle_id`);--> statement-breakpoint
CREATE INDEX `list_owner_idx` ON `list` (`owner_id`);--> statement-breakpoint
CREATE TABLE `list_item` (
	`list_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`added_by` text NOT NULL,
	`note` text,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`list_id`, `media_id`),
	FOREIGN KEY (`list_id`) REFERENCES `list`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`watched_on` text NOT NULL,
	`rating` integer,
	`review` text,
	`contains_spoilers` integer DEFAULT false NOT NULL,
	`platform` text,
	`is_rewatch` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `log_user_idx` ON `log` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `log_media_idx` ON `log` (`media_id`);--> statement-breakpoint
CREATE TABLE `log_watched_with` (
	`log_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`log_id`, `user_id`),
	FOREIGN KEY (`log_id`) REFERENCES `log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_entity` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`tmdb_id` integer,
	`anilist_id` integer,
	`imdb_id` text,
	`original_title` text NOT NULL,
	`year` integer,
	`runtime_min` integer,
	`poster_path` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_tmdb_uq` ON `media_entity` (`kind`,`tmdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_anilist_uq` ON `media_entity` (`anilist_id`);--> statement-breakpoint
CREATE TABLE `media_title` (
	`media_id` text NOT NULL,
	`locale` text NOT NULL,
	`title` text NOT NULL,
	PRIMARY KEY(`media_id`, `locale`),
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text,
	`circle_id` text,
	`log_id` text,
	`read_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`log_id`) REFERENCES `log`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `now_watching` (
	`user_id` text PRIMARY KEY NOT NULL,
	`media_id` text NOT NULL,
	`progress` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reaction` (
	`log_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`log_id`, `user_id`, `emoji`),
	FOREIGN KEY (`log_id`) REFERENCES `log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`is_anonymous` integer DEFAULT false,
	`locale` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
