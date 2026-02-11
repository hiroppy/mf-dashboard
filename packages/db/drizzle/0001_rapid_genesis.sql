CREATE TABLE `analytics_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` text NOT NULL,
	`date` text NOT NULL,
	`summary` text,
	`savings_insight` text,
	`investment_insight` text,
	`spending_insight` text,
	`balance_insight` text,
	`liability_insight` text,
	`model` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_reports_group_date_idx` ON `analytics_reports` (`group_id`,`date`);--> statement-breakpoint
CREATE INDEX `analytics_reports_group_id_idx` ON `analytics_reports` (`group_id`);