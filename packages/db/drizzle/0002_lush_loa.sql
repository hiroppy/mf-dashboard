CREATE TABLE `cash_flow_periods` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`transaction_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_flow_periods_month_idx` ON `cash_flow_periods` (`month`);