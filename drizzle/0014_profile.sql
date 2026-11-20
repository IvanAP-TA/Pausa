CREATE TABLE `favorite` (
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `media_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user` ADD `favorite_genres` text DEFAULT '[]' NOT NULL;