CREATE TABLE `bank_forecast_dismissals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`direction` text NOT NULL,
	`recurring_identity` text NOT NULL,
	`dismissed_through_date` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_forecast_dismissals_candidate_idx` ON `bank_forecast_dismissals` (`account_id`,`direction`,`recurring_identity`);--> statement-breakpoint
CREATE INDEX `bank_forecast_dismissals_account_id_idx` ON `bank_forecast_dismissals` (`account_id`);--> statement-breakpoint
ALTER TABLE `account_statuses` ADD `scheduled_withdrawal_amount` integer;--> statement-breakpoint
ALTER TABLE `account_statuses` ADD `scheduled_withdrawal_confirmed` integer DEFAULT false NOT NULL;