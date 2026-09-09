CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_auth_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `saju_profiles` (
	`id` text PRIMARY KEY,
	`user_id` text,
	`birth_date` text NOT NULL,
	`birth_time` text,
	`gender` text,
	`calendar_type` text NOT NULL,
	`is_leap_month` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_saju_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_provider_account_unique` ON `auth_accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE INDEX `auth_accounts_user_id_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `saju_profiles_user_id_idx` ON `saju_profiles` (`user_id`);