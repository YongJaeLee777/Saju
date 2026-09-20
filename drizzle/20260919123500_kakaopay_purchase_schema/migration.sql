CREATE TABLE `anonymous_buyers` (
	`id` text PRIMARY KEY,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY,
	`buyer_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`report_year` integer NOT NULL,
	`provider` text NOT NULL,
	`environment` text NOT NULL,
	`cid` text NOT NULL,
	`partner_order_id` text NOT NULL,
	`partner_user_id` text NOT NULL,
	`tid` text,
	`approval_aid` text,
	`product_code` text NOT NULL,
	`item_name` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'KRW' NOT NULL,
	`expected_total_amount` integer NOT NULL,
	`expected_tax_free_amount` integer NOT NULL,
	`expected_vat_amount` integer,
	`approved_total_amount` integer,
	`approved_amount_json` text,
	`payment_method_type` text,
	`provider_approved_at` integer,
	`status` text DEFAULT 'ready' NOT NULL,
	`processing_phase` text DEFAULT 'preparing' NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`callback_state_hash` text NOT NULL,
	`callback_expires_at` integer NOT NULL,
	`lease_token` text,
	`lease_expires_at` integer,
	`draft_report_json` text,
	`report_context_json` text NOT NULL,
	`report_schema_version` text NOT NULL,
	`methodology_versions_json` text NOT NULL,
	`reference_at` integer NOT NULL,
	`input_hash` text NOT NULL,
	`report_hash` text NOT NULL,
	`last_error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`approved_at` integer,
	CONSTRAINT `fk_purchases_buyer_id_anonymous_buyers_id_fk` FOREIGN KEY (`buyer_id`) REFERENCES `anonymous_buyers`(`id`),
	CONSTRAINT `fk_purchases_profile_id_saju_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `saju_profiles`(`id`),
	CONSTRAINT "purchases_provider_check" CHECK("provider" = 'kakaopay'),
	CONSTRAINT "purchases_environment_check" CHECK("environment" IN ('test', 'live')),
	CONSTRAINT "purchases_status_check" CHECK("status" IN ('ready', 'approved', 'failed', 'cancelled')),
	CONSTRAINT "purchases_processing_phase_check" CHECK("processing_phase" IN ('preparing', 'awaiting_user', 'approving', 'reconciling', 'complete')),
	CONSTRAINT "purchases_currency_check" CHECK("currency" = 'KRW'),
	CONSTRAINT "purchases_quantity_check" CHECK("quantity" = 1),
	CONSTRAINT "purchases_amounts_check" CHECK(
    typeof("expected_total_amount") = 'integer' AND "expected_total_amount" > 0
    AND typeof("expected_tax_free_amount") = 'integer'
    AND "expected_tax_free_amount" BETWEEN 0 AND "expected_total_amount"
    AND ("expected_vat_amount" IS NULL OR (
      typeof("expected_vat_amount") = 'integer'
      AND "expected_vat_amount" BETWEEN 0 AND "expected_total_amount" - "expected_tax_free_amount"
    ))
    AND ("approved_total_amount" IS NULL OR (
      typeof("approved_total_amount") = 'integer' AND "approved_total_amount" >= 0
    ))
  )
);
--> statement-breakpoint
CREATE TABLE `report_entitlements` (
	`id` text PRIMARY KEY,
	`buyer_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`report_year` integer NOT NULL,
	`environment` text NOT NULL,
	`purchase_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`granted_at` integer NOT NULL,
	`revoked_at` integer,
	CONSTRAINT `fk_report_entitlements_buyer_id_anonymous_buyers_id_fk` FOREIGN KEY (`buyer_id`) REFERENCES `anonymous_buyers`(`id`),
	CONSTRAINT `fk_report_entitlements_profile_id_saju_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `saju_profiles`(`id`),
	CONSTRAINT `fk_report_entitlements_purchase_id_purchases_id_fk` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`),
	CONSTRAINT `fk_report_entitlements_snapshot_id_report_snapshots_id_fk` FOREIGN KEY (`snapshot_id`) REFERENCES `report_snapshots`(`id`),
	CONSTRAINT "report_entitlements_environment_check" CHECK("environment" IN ('test', 'live'))
);
--> statement-breakpoint
CREATE TABLE `report_snapshots` (
	`id` text PRIMARY KEY,
	`purchase_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`report_year` integer NOT NULL,
	`report_json` text NOT NULL,
	`schema_version` text NOT NULL,
	`methodology_versions_json` text NOT NULL,
	`reference_at` integer NOT NULL,
	`input_hash` text NOT NULL,
	`report_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_report_snapshots_purchase_id_purchases_id_fk` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`),
	CONSTRAINT `fk_report_snapshots_profile_id_saju_profiles_id_fk` FOREIGN KEY (`profile_id`) REFERENCES `saju_profiles`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anonymous_buyers_token_hash_unique` ON `anonymous_buyers` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_partner_order_id_unique` ON `purchases` (`partner_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_provider_tid_unique` ON `purchases` (`provider`,`environment`,`cid`,`tid`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_buyer_idempotency_unique` ON `purchases` (`buyer_id`,`environment`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_active_report_unique` ON `purchases` (`buyer_id`,`profile_id`,`report_year`,`environment`) WHERE "purchases"."status" IN ('ready', 'approved');--> statement-breakpoint
CREATE INDEX `purchases_processing_idx` ON `purchases` (`status`,`processing_phase`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_entitlements_buyer_report_unique` ON `report_entitlements` (`buyer_id`,`profile_id`,`report_year`,`environment`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_entitlements_purchase_id_unique` ON `report_entitlements` (`purchase_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_snapshots_purchase_id_unique` ON `report_snapshots` (`purchase_id`);