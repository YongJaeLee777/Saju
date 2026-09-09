CREATE TABLE `saju_results` (
	`id` text PRIMARY KEY,
	`profile_id` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_saju_results_profile_id_saju_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `saju_profiles`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saju_results_profile_id_unique` ON `saju_results` (`profile_id`);