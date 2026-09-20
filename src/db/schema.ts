import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/sqlite-core'

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
  ],
)

export const authAccounts = sqliteTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    createdAt: integer('created_at', {
      mode: 'timestamp',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('auth_accounts_provider_account_unique')
      .on(table.provider, table.providerAccountId),

    index('auth_accounts_user_id_idx')
      .on(table.userId),
  ],
)

export const sajuProfiles = sqliteTable(
  'saju_profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id),
    birthDate: text('birth_date').notNull(),
    birthTime: text('birth_time'),
    gender: text('gender'),
    calendarType: text('calendar_type')
      .notNull(),
    isLeapMonth: integer('is_leap_month', {
      mode: 'boolean',
    }).notNull().default(false),
    createdAt: integer('created_at', {
      mode: 'timestamp',
    }).notNull(),
    updatedAt: integer('updated_at', {
      mode: 'timestamp',
    }).notNull(),
  },
  (table) => [
    index('saju_profiles_user_id_idx')
      .on(table.userId),
  ],
)

export const sajuResults = sqliteTable(
  'saju_results',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => sajuProfiles.id),
    resultJson: text('result_json')
      .notNull(),
    createdAt: integer('created_at', {
      mode: 'timestamp',
    }).notNull(),
    updatedAt: integer('updated_at', {
      mode: 'timestamp',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('saju_results_profile_id_unique')
      .on(table.profileId),
  ],
)

// Store only a hash of the buyer credential, never the cookie value.
export const anonymousBuyers = sqliteTable('anonymous_buyers', {
  id: text('id').primaryKey().notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
}, (table) => [
  uniqueIndex('anonymous_buyers_token_hash_unique').on(table.tokenHash),
])

// Payment credentials (pg_token / API secrets) must never be persisted here.
export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey().notNull(),
  buyerId: text('buyer_id').notNull().references(() => anonymousBuyers.id),
  profileId: text('profile_id').notNull().references(() => sajuProfiles.id),
  reportYear: integer('report_year').notNull(),
  provider: text('provider', { enum: ['kakaopay'] }).notNull(),
  environment: text('environment', { enum: ['test', 'live'] }).notNull(),
  cid: text('cid').notNull(),
  partnerOrderId: text('partner_order_id').notNull(),
  partnerUserId: text('partner_user_id').notNull(),
  tid: text('tid'),
  approvalAid: text('approval_aid'),
  productCode: text('product_code').notNull(),
  itemName: text('item_name').notNull(),
  quantity: integer('quantity').notNull().default(1),
  currency: text('currency', { enum: ['KRW'] }).notNull().default('KRW'),
  expectedTotalAmount: integer('expected_total_amount').notNull(),
  expectedTaxFreeAmount: integer('expected_tax_free_amount').notNull(),
  expectedVatAmount: integer('expected_vat_amount'),
  approvedTotalAmount: integer('approved_total_amount'),
  approvedAmountJson: text('approved_amount_json'),
  paymentMethodType: text('payment_method_type'),
  providerApprovedAt: integer('provider_approved_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['ready', 'approved', 'failed', 'cancelled'] }).notNull().default('ready'),
  processingPhase: text('processing_phase', {
    enum: ['preparing', 'awaiting_user', 'approving', 'reconciling', 'complete'],
  }).notNull().default('preparing'),
  idempotencyKey: text('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  callbackStateHash: text('callback_state_hash').notNull(),
  callbackExpiresAt: integer('callback_expires_at', { mode: 'timestamp' }).notNull(),
  leaseToken: text('lease_token'),
  leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp' }),
  // Clear the draft after finalization; retain the immutable report snapshot.
  draftReportJson: text('draft_report_json'),
  reportContextJson: text('report_context_json').notNull(),
  reportSchemaVersion: text('report_schema_version').notNull(),
  methodologyVersionsJson: text('methodology_versions_json').notNull(),
  referenceAt: integer('reference_at', { mode: 'timestamp' }).notNull(),
  inputHash: text('input_hash').notNull(),
  reportHash: text('report_hash').notNull(),
  lastErrorCode: text('last_error_code'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
}, (table) => [
  uniqueIndex('purchases_partner_order_id_unique').on(table.partnerOrderId),
  uniqueIndex('purchases_provider_tid_unique').on(table.provider, table.environment, table.cid, table.tid),
  uniqueIndex('purchases_buyer_idempotency_unique').on(table.buyerId, table.environment, table.idempotencyKey),
  uniqueIndex('purchases_active_report_unique')
    .on(table.buyerId, table.profileId, table.reportYear, table.environment)
    .where(sql`${table.status} IN ('ready', 'approved')`),
  index('purchases_processing_idx').on(table.status, table.processingPhase, table.updatedAt, table.id),
  check('purchases_provider_check', sql`${table.provider} = 'kakaopay'`),
  check('purchases_environment_check', sql`${table.environment} IN ('test', 'live')`),
  check('purchases_status_check', sql`${table.status} IN ('ready', 'approved', 'failed', 'cancelled')`),
  check('purchases_processing_phase_check', sql`${table.processingPhase} IN ('preparing', 'awaiting_user', 'approving', 'reconciling', 'complete')`),
  check('purchases_currency_check', sql`${table.currency} = 'KRW'`),
  check('purchases_quantity_check', sql`${table.quantity} = 1`),
  check('purchases_amounts_check', sql`
    typeof(${table.expectedTotalAmount}) = 'integer' AND ${table.expectedTotalAmount} > 0
    AND typeof(${table.expectedTaxFreeAmount}) = 'integer'
    AND ${table.expectedTaxFreeAmount} BETWEEN 0 AND ${table.expectedTotalAmount}
    AND (${table.expectedVatAmount} IS NULL OR (
      typeof(${table.expectedVatAmount}) = 'integer'
      AND ${table.expectedVatAmount} BETWEEN 0 AND ${table.expectedTotalAmount} - ${table.expectedTaxFreeAmount}
    ))
    AND (${table.approvedTotalAmount} IS NULL OR (
      typeof(${table.approvedTotalAmount}) = 'integer' AND ${table.approvedTotalAmount} >= 0
    ))
  `),
])

// Server-only report JSON includes provenance; clients receive a projection.
export const reportSnapshots = sqliteTable('report_snapshots', {
  id: text('id').primaryKey().notNull(),
  purchaseId: text('purchase_id').notNull().references(() => purchases.id),
  profileId: text('profile_id').notNull().references(() => sajuProfiles.id),
  reportYear: integer('report_year').notNull(),
  reportJson: text('report_json').notNull(),
  schemaVersion: text('schema_version').notNull(),
  methodologyVersionsJson: text('methodology_versions_json').notNull(),
  referenceAt: integer('reference_at', { mode: 'timestamp' }).notNull(),
  inputHash: text('input_hash').notNull(),
  reportHash: text('report_hash').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  uniqueIndex('report_snapshots_purchase_id_unique').on(table.purchaseId),
])

export const reportEntitlements = sqliteTable('report_entitlements', {
  id: text('id').primaryKey().notNull(),
  buyerId: text('buyer_id').notNull().references(() => anonymousBuyers.id),
  profileId: text('profile_id').notNull().references(() => sajuProfiles.id),
  reportYear: integer('report_year').notNull(),
  environment: text('environment', { enum: ['test', 'live'] }).notNull(),
  purchaseId: text('purchase_id').notNull().references(() => purchases.id),
  snapshotId: text('snapshot_id').notNull().references(() => reportSnapshots.id),
  grantedAt: integer('granted_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
}, (table) => [
  uniqueIndex('report_entitlements_buyer_report_unique')
    .on(table.buyerId, table.profileId, table.reportYear, table.environment),
  uniqueIndex('report_entitlements_purchase_id_unique').on(table.purchaseId),
  check('report_entitlements_environment_check', sql`${table.environment} IN ('test', 'live')`),
])
