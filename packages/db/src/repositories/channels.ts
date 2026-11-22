import { and, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '../client.js'
import { page } from '../pagination.js'
import { channels } from '../schema.js'
import { toNumber, toNumeric } from './numeric.js'

export interface Channel {
  id: string
  workspaceId: string
  platform: string
  displayName: string
  locale: string
  reviewPolicy: string
  autoScoreThreshold: number | null
  createdAt: Date
  updatedAt: Date
}

export interface ChannelInput {
  platform: 'tiktok'
  displayName: string
  locale?: string
  reviewPolicy?: 'manual' | 'auto_if_score'
  autoScoreThreshold?: number | null
}

export type ChannelPatch = Partial<Omit<ChannelInput, 'platform'>>

const toChannel = (row: typeof channels.$inferSelect): Channel => ({ ...row, autoScoreThreshold: toNumber(row.autoScoreThreshold) })

const inWorkspace = (workspaceId: string, id: string) => and(eq(channels.workspaceId, workspaceId), eq(channels.id, id))

export async function listChannels(db: Db, workspaceId: string, opts: { limit: number; cursor?: string }) {
  const rows = await db.select().from(channels)
    .where(and(eq(channels.workspaceId, workspaceId), opts.cursor ? lt(channels.id, opts.cursor) : undefined))
    .orderBy(desc(channels.id))
    .limit(opts.limit + 1)
  const { items, nextCursor } = page(rows, opts.limit)
  return { items: items.map(toChannel), nextCursor }
}

export async function getChannel(db: Db, workspaceId: string, id: string): Promise<Channel | undefined> {
  const [row] = await db.select().from(channels).where(inWorkspace(workspaceId, id))
  return row && toChannel(row)
}

export async function createChannel(db: Db, workspaceId: string, input: ChannelInput): Promise<Channel> {
  const [row] = await db.insert(channels).values({
    workspaceId,
    platform: input.platform,
    displayName: input.displayName,
    locale: input.locale,
    reviewPolicy: input.reviewPolicy,
    autoScoreThreshold: toNumeric(input.autoScoreThreshold ?? null),
  }).returning()
  return toChannel(row!)
}

export async function updateChannel(db: Db, workspaceId: string, id: string, patch: ChannelPatch): Promise<Channel | undefined> {
  const [row] = await db.update(channels).set({
    displayName: patch.displayName,
    locale: patch.locale,
    reviewPolicy: patch.reviewPolicy,
    autoScoreThreshold: patch.autoScoreThreshold === undefined ? undefined : toNumeric(patch.autoScoreThreshold),
  }).where(inWorkspace(workspaceId, id)).returning()
  return row && toChannel(row)
}
