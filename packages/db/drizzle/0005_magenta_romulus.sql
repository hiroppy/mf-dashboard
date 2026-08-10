DROP INDEX `bank_forecast_manual_events_account_date_idx`;--> statement-breakpoint
ALTER TABLE `bank_forecast_manual_events` ADD `group_id` text NOT NULL REFERENCES groups(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `bank_forecast_manual_events_group_account_date_idx` ON `bank_forecast_manual_events` (`group_id`,`account_id`,`date`);
