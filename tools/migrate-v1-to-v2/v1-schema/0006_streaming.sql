CREATE TABLE `media_availability_check` (
	`media_id` text NOT NULL,
	`country` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`media_id`, `country`),
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_provider` (
	`media_id` text NOT NULL,
	`country` text NOT NULL,
	`provider_id` integer NOT NULL,
	`name` text NOT NULL,
	`logo_path` text,
	PRIMARY KEY(`media_id`, `country`, `provider_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_provider` (
	`user_id` text NOT NULL,
	`provider_id` integer NOT NULL,
	`name` text NOT NULL,
	`logo_path` text,
	PRIMARY KEY(`user_id`, `provider_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `country` text;