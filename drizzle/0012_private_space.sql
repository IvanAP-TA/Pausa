CREATE TABLE `log_share` (
	`log_id` text NOT NULL,
	`circle_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`log_id`, `circle_id`),
	FOREIGN KEY (`log_id`) REFERENCES `log`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `log_share_circle_idx` ON `log_share` (`circle_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_detail` (
	`media_id` text NOT NULL,
	`locale` text NOT NULL,
	`overview` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`cast` text DEFAULT '[]' NOT NULL,
	`source` text DEFAULT 'none' NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`media_id`, `locale`),
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `log` ADD `scope` text DEFAULT 'circles' NOT NULL;--> statement-breakpoint
UPDATE `user` SET `name` = substr(`email`, 1, instr(`email`, '@') - 1) WHERE trim(`name`) = '' AND instr(`email`, '@') > 1;
