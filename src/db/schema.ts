import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
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