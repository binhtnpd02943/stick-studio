import { v7 } from 'uuid'
import { type Db, createDb } from './client.js'
import { createApiToken, createUser, createWorkspaceWithOwner } from './repositories/identity.js'
import { type Channel, createChannel } from './repositories/channels.js'
import type { User } from './repositories/identity.js'
import type { Workspace } from './repositories/workspaces.js'

export const createTestDb = () => createDb({})

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
