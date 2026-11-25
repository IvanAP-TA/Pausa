CREATE TABLE `report` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`circle_id` text,
	`reason` text DEFAULT 'other' NOT NULL,
	`note` text,
	`excerpt` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	`resolution` text,
	FOREIGN KEY (`reporter_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `report_open_idx` ON `report` (`resolved_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_once_uq` ON `report` (`reporter_id`,`kind`,`target_id`);