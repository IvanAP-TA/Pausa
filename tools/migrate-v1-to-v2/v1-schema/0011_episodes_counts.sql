CREATE TABLE `media_season` (
	`media_id` text NOT NULL,
	`season` integer NOT NULL,
	`episodes` integer NOT NULL,
	PRIMARY KEY(`media_id`, `season`),
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `log` ADD `episode` integer;--> statement-breakpoint
ALTER TABLE `media_entity` ADD `episodes_total` integer;--> statement-breakpoint
ALTER TABLE `media_entity` ADD `details_checked_at` integer;