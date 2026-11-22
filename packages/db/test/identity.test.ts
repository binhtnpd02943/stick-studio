import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  type Db, apiTokens, createApiToken, createSession, createUser, createWorkspaceWithOwner, deleteSession,
  findApiToken, findSession, sessions, users, verifyPassword,
} from '../src/index.js'
import { createTestDb } from '../src/testing.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

const PASSWORD = 'correct horse battery'

describe('users', () => {
  test('email is unique case-insensitively and stored lowercased and trimmed', async () => {
    const u = await createUser(db, { email: '  Ada@Example.COM ', name: 'Ada', password: PASSWORD })
    expect(u.email).toBe('ada@example.com')
    await expect(createUser(db, { email: 'ADA@example.com', name: 'Again', password: PASSWORD })).rejects.toThrow(/exists|conflict/i)
  })

  test('verifyPassword accepts the right password and rejects a wrong one and an unknown email', async () => {
    await createUser(db, { email: 'bob@example.com', name: 'Bob', password: PASSWORD })
    expect((await verifyPassword(db, 'Bob@example.com', PASSWORD))?.name).toBe('Bob')
    expect(await verifyPassword(db, 'bob@example.com', 'wrong password!!')).toBeUndefined()
    expect(await verifyPassword(db, 'nobody@example.com', PASSWORD)).toBeUndefined()
  })

  test('the stored hash is argon2id, never the password', async () => {
    const [row] = await db.select().from(users).where(eq(users.email, 'bob@example.com'))
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/)
  })

  test('a password under 12 characters is refused', async () => {
    await expect(createUser(db, { email: 'short@example.com', name: 'S', password: 'elevenchars' })).rejects.toThrow(/12/)
  })
})

describe('sessions and tokens', () => {
  async function principalFixture() {
    const user = await createUser(db, { email: `u${Math.random()}@example.com`, name: 'U', password: PASSWORD })
    const workspace = await createWorkspaceWithOwner(db, { name: 'W', userId: user.id })
    return { user, workspace }
  }

  test('createWorkspaceWithOwner makes the user an owner and keeps caps', async () => {
    const user = await createUser(db, { email: 'owner@example.com', name: 'O', password: PASSWORD })
    const ws = await createWorkspaceWithOwner(db, { name: 'Caps', userId: user.id, maxCostPerFilmUsd: 2.5 })
    expect(ws.maxCostPerFilmUsd).toBe(2.5)
    expect(ws.maxCostPerDayUsd).toBeNull()
    const s = await createSession(db, { userId: user.id, workspaceId: ws.id })
    expect((await findSession(db, s.token))?.role).toBe('owner')
  })

  test('session token is stored hashed, expires, and delete ends it', async () => {
    const { user, workspace } = await principalFixture()
    const s = await createSession(db, { userId: user.id, workspaceId: workspace.id })
    const stored = await db.select().from(sessions).where(eq(sessions.userId, user.id))
    expect(JSON.stringify(stored)).not.toContain(s.token)
    expect(stored[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    const p = await findSession(db, s.token)
    expect(p).toMatchObject({ userId: user.id, workspaceId: workspace.id, role: 'owner', via: 'session', csrfToken: s.csrfToken })
    expect(p?.sessionId).toBeDefined()

    await deleteSession(db, s.token)
    expect(await findSession(db, s.token)).toBeUndefined()

    const expired = await createSession(db, { userId: user.id, workspaceId: workspace.id, ttlSec: -1 })
    expect(await findSession(db, expired.token)).toBeUndefined()
    expect(await findSession(db, 'not-a-token')).toBeUndefined()
  })

  test('api token is stored as sha256 hex, revoked tokens are refused, last_used_at is set', async () => {
    const { user, workspace } = await principalFixture()
    const { id, token } = await createApiToken(db, { workspaceId: workspace.id, userId: user.id, name: 'ci' })
    expect(token).toMatch(/^stk_[A-Za-z0-9_-]{43}$/)
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, id))
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row!.tokenHash).not.toContain(token)
    expect(row!.lastUsedAt).toBeNull()

    expect(await findApiToken(db, token)).toMatchObject({ userId: user.id, workspaceId: workspace.id, via: 'token', tokenId: id, role: 'owner' })
    const [used] = await db.select().from(apiTokens).where(eq(apiTokens.id, id))
    expect(used!.lastUsedAt).toBeInstanceOf(Date)

    await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id))
    expect(await findApiToken(db, token)).toBeUndefined()
    expect(await findApiToken(db, 'stk_unknown')).toBeUndefined()
  })
})
