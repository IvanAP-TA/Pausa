CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text NOT NULL,
	`code` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_code_unique` ON `invite` (`code`);--> statement-breakpoint
CREATE INDEX `invite_circle_idx` ON `invite` (`circle_id`);--> statement-breakpoint
-- Keep the invite links already in circulation: one non-expiring invite per existing Cerchia.
INSERT INTO `invite` (`id`, `circle_id`, `code`, `created_by`, `created_at`)
SELECT lower(hex(randomblob(16))), `id`, `invite_code`, `created_by`, `created_at` FROM `circle`;--> statement-breakpoint
DROP INDEX `circle_invite_code_unique`;--> statement-breakpoint
ALTER TABLE `circle` DROP COLUMN `invite_code`;--> statement-breakpoint
ALTER TABLE `notification` ADD `media_id` text REFERENCES media_entity(id);