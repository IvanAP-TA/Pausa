ALTER TABLE `media_entity` ADD `mal_id` integer;--> statement-breakpoint
ALTER TABLE `media_entity` ADD `letterboxd_uri` text;--> statement-breakpoint
CREATE UNIQUE INDEX `media_mal_uq` ON `media_entity` (`mal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_letterboxd_uq` ON `media_entity` (`letterboxd_uri`);