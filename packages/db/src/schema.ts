import { FILM_STATUSES, FILM_STEPS } from '@stick/core'
import { sql } from 'drizzle-orm'
import {
  bigint, check, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'
import { v7 } from 'uuid'

const newId = () => v7()
const now = () => new Date()
const id = () => uuid('id').primaryKey().$defaultFn(newId)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(now)
const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`)
const money = (name: string) => numeric(name, { precision: 12, scale: 6 })

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('personal'),
  maxCostPerFilmUsd: money('max_cost_per_film_usd'),
  maxCostPerDayUsd: money('max_cost_per_day_usd'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.userId] }),
  check('workspace_members_role_check', inList('role', ['owner', 'editor', 'viewer'])),
])

export const apiTokens = pgTable('api_tokens', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const sessions = pgTable('sessions', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => users.id),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  tokenHash: text('token_hash').notNull().unique(),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('sessions_expires_at_idx').on(t.expiresAt)])

export const channels = pgTable('channels', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  platform: text('platform').notNull(),
  displayName: text('display_name').notNull(),
  locale: text('locale').notNull().default('vi-VN'),
  reviewPolicy: text('review_policy').notNull().default('manual'),
  autoScoreThreshold: numeric('auto_score_threshold'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, () => [
  check('channels_platform_check', inList('platform', ['tiktok'])),
  check('channels_review_policy_check', inList('review_policy', ['manual', 'auto_if_score'])),
])

export const characters = pgTable('characters', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  name: text('name').notNull(),
  look: jsonb('look'),
  voiceId: text('voice_id'),
  description: text('description'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const films = pgTable('films', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  channelId: uuid('channel_id').notNull().references(() => channels.id),
  // topics are deferred, so no FK yet
  topicId: uuid('topic_id'),
  sourceType: text('source_type').notNull().default('story'),
  title: text('title').notNull(),
  brief: text('brief'),
  status: text('status').notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  qaScore: numeric('qa_score'),
  costUsd: money('cost_usd').notNull().default('0'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  idempotencyKey: text('idempotency_key'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('films_source_type_check', inList('source_type', ['story', 'remake'])),
  check('films_status_check', inList('status', FILM_STATUSES)),
  index('films_workspace_status_created_idx').on(t.workspaceId, t.status, t.createdAt.desc()),
  uniqueIndex('films_workspace_idempotency_key_idx').on(t.workspaceId, t.idempotencyKey),
])

export const filmVersions = pgTable('film_versions', {
  id: id(),
  filmId: uuid('film_id').notNull().references(() => films.id),
  version: integer('version').notNull(),
  parentVersion: integer('parent_version'),
  reason: text('reason').notNull().default('initial'),
  restartFromStep: text('restart_from_step'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('film_versions_film_version_idx').on(t.filmId, t.version),
  check('film_versions_restart_from_step_check', inList('restart_from_step', FILM_STEPS)),
])

export const stepRuns = pgTable('step_runs', {
  id: id(),
  filmVersionId: uuid('film_version_id').notNull().references(() => filmVersions.id),
  step: text('step').notNull(),
  attempt: integer('attempt').notNull().default(1),
  status: text('status').notNull(),
  inputHash: text('input_hash'),
  error: jsonb('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check('step_runs_step_check', inList('step', FILM_STEPS)),
  check('step_runs_status_check', inList('status', ['pending', 'running', 'succeeded', 'failed', 'skipped'])),
  uniqueIndex('step_runs_version_step_attempt_idx').on(t.filmVersionId, t.step, t.attempt),
  index('step_runs_version_step_idx').on(t.filmVersionId, t.step),
])

export const assets = pgTable('assets', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  filmVersionId: uuid('film_version_id').references(() => filmVersions.id),
  kind: text('kind').notNull(),
  storageKey: text('storage_key').notNull(),
  mime: text('mime'),
  bytes: bigint('bytes', { mode: 'number' }),
  sha256: text('sha256'),
  // { path }: the work-dir relative path
  meta: jsonb('meta'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('assets_film_version_idx').on(t.filmVersionId)])

export const reviews = pgTable('reviews', {
  id: id(),
  filmVersionId: uuid('film_version_id').notNull().references(() => filmVersions.id),
  reviewerId: uuid('reviewer_id').notNull().references(() => users.id),
  decision: text('decision').notNull(),
  reason: text('reason'),
  redoFromStep: text('redo_from_step'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, () => [check('reviews_decision_check', inList('decision', ['approved', 'redo']))])

export const usageEvents = pgTable('usage_events', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  filmVersionId: uuid('film_version_id').references(() => filmVersions.id),
  step: text('step'),
  provider: text('provider').notNull(),
  model: text('model'),
  units: jsonb('units'),
  costUsd: money('cost_usd').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index('usage_events_workspace_created_idx').on(t.workspaceId, t.createdAt)])

export const auditLog = pgTable('audit_log', {
  id: id(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  target: text('target').notNull(),
  data: jsonb('data'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
