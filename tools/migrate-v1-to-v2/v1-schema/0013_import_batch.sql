CREATE TABLE `import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`circle_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `import_batch_user_idx` ON `import_batch` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `list` ADD `import_batch_id` text REFERENCES import_batch(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `log` ADD `import_batch_id` text REFERENCES import_batch(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `log_batch_idx` ON `log` (`import_batch_id`);--> statement-breakpoint
ALTER TABLE `log_share` ADD `import_batch_id` text REFERENCES import_batch(id) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `log_share_batch_idx` ON `log_share` (`import_batch_id`);