import pg from 'pg'
import { v7 } from 'uuid'
import { type Db, createDb } from './client.js'
import { createApiToken, createUser, createWorkspaceWithOwner } from './repositories/identity.js'
import { type Channel, createChannel } from './repositories/channels.js'
import type { User } from './repositories/identity.js'
import type { Workspace } from './repositories/workspaces.js'

/** Set to a Postgres URL to run the db suite against real Postgres instead of PGlite. */
export const TEST_DATABASE_URL = process.env.STICK_TEST_DATABASE_URL || undefined

/** A throwaway database on the server behind `baseUrl`, so tests are isolated and parallel-safe. */
export async function createTempDatabase(baseUrl: string): Promise<{ url: string; drop(): Promise<void> }> {
  const name = `stick_t_${v7().replaceAll('-', '')}`
  const withDatabase = (database: string) => {
    const u = new URL(baseUrl)
    u.pathname = `/${database}`
    return u.toString()
  }
  const admin = new pg.Client({ connectionString: baseUrl })
  await admin.connect()
  try {
    await admin.query(`create database ${name}`)
  } finally {
    await admin.end()
  }
  return {
    url: withDatabase(name),
    async drop() {
      const a = new pg.Client({ connectionString: baseUrl })
      await a.connect()
      try {
        await a.query(`drop database if exists ${name} with (force)`)
      } finally {
        await a.end()
      }
    },
  }
}

/** PGlite in memory by default; a private database on STICK_TEST_DATABASE_URL when that is set. */
export async function createTestDb(): Promise<{ db: Db; close(): Promise<void> }> {
  if (!TEST_DATABASE_URL) return createDb({})
  const temp = await createTempDatabase(TEST_DATABASE_URL)
  try {
    const { db, close } = await createDb({ url: temp.url })
    return { db, close: async () => { await close(); await temp.drop() } }
  } catch (err) {
    await temp.drop()
    throw err
  }
}

export interface SeedOverrides {
  email?: string
  name?: string
  password?: string
  workspaceName?: string
  channelName?: string
}

/** One owner, one workspace, one TikTok channel and an API token. Each call uses a fresh unique email. */
export async function seedWorkspace(db: Db, overrides: SeedOverrides = {}): Promise<{
  user: User
  workspace: Workspace
  channel: Channel
  token: string
  password: string
}> {
  const password = overrides.password ?? 'seed-password-123'
  const user = await createUser(db, { email: overrides.email ?? `seed-${v7()}@example.test`, name: overrides.name ?? 'Seed User', password })
  const workspace = await createWorkspaceWithOwner(db, { name: overrides.workspaceName ?? 'Seed Workspace', userId: user.id })
  const channel = await createChannel(db, workspace.id, { platform: 'tiktok', displayName: overrides.channelName ?? 'Seed Channel' })
  const { token } = await createApiToken(db, { workspaceId: workspace.id, userId: user.id, name: 'seed' })
  return { user, workspace, channel, token, password }
}
