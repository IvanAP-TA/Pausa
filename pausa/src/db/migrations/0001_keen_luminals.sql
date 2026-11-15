CREATE TABLE `now_watching` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`circle_id` text NOT NULL,
	`media_entity_id` text NOT NULL,
	`started_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_entity_id`) REFERENCES `media_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serata_candidates` (
	`serata_id` text NOT NULL,
	`media_entity_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`serata_id`, `media_entity_id`),
	FOREIGN KEY (`serata_id`) REFERENCES `serate`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_entity_id`) REFERENCES `media_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serata_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`serata_id` text NOT NULL,
	`user_id` text,
	`guest_name` text NOT NULL,
	`avatar` text,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`serata_id`) REFERENCES `serate`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serata_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`serata_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`media_entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`serata_id`) REFERENCES `serate`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`participant_id`) REFERENCES `serata_participants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_entity_id`) REFERENCES `media_entities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serate` (
	`id` text PRIMARY KEY NOT NULL,
	`circle_id` text,
	`mode` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text NOT NULL,
	`winner_media_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`circle_id`) REFERENCES `circles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winner_media_id`) REFERENCES `media_entities`(`id`) ON UPDATE no action ON DELETE no action
);
