CREATE TABLE `serata` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`circle_id` text,
	`host_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`state` text,
	`winner_media_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`circle_id`) REFERENCES `circle`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`host_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`winner_media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serata_code_unique` ON `serata` (`code`);--> statement-breakpoint
CREATE INDEX `serata_circle_idx` ON `serata` (`circle_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `serata_candidate` (
	`serata_id` text NOT NULL,
	`media_id` text NOT NULL,
	`seed` integer NOT NULL,
	PRIMARY KEY(`serata_id`, `media_id`),
	FOREIGN KEY (`serata_id`) REFERENCES `serata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `serata_participant` (
	`serata_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`is_guest` integer DEFAULT false NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`serata_id`, `user_id`),
	FOREIGN KEY (`serata_id`) REFERENCES `serata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `serata_vote` (
	`serata_id` text NOT NULL,
	`user_id` text NOT NULL,
	`round` integer DEFAULT 0 NOT NULL,
	`match` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`media_id` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`serata_id`, `user_id`, `round`, `match`, `kind`, `media_id`),
	FOREIGN KEY (`serata_id`) REFERENCES `serata`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media_entity`(`id`) ON UPDATE no action ON DELETE no action
);
