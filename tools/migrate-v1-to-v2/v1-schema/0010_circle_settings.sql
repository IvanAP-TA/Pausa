CREATE TABLE `notification_off` (
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	PRIMARY KEY(`user_id`, `type`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `circle` ADD `description` text;--> statement-breakpoint
ALTER TABLE `circle` ADD `cover` text;--> statement-breakpoint
ALTER TABLE `circle` ADD `live_watching` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `circle_member` ADD `muted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `circle_member` ADD `hide_watching` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `email_digest` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `digest_sent_at` integer;