import { hash, verify } from '@node-rs/argon2'
import { and, asc, eq, getTableColumns, gt, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import type { Db } from '../client.js'
import { ConflictError } from '../errors.js'
import { apiTokens, sessions, users, workspaceMembers, workspaces } from '../schema.js'
import { type Workspace, toWorkspace } from './workspaces.js'
import { toNumeric } from './numeric.js'

export type Role = 'owner' | 'editor' | 'viewer'

export interface Principal {
  userId: string
  workspaceId: string
  role: Role
  via: 'session' | 'token'
  sessionId?: string
  tokenId?: string
  csrfToken?: string
}

export type User = Omit<typeof users.$inferSelect, 'passwordHash'>

export const MIN_PASSWORD_LENGTH = 12
export const SESSION_TTL_SEC = 2_592_000

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')
const randomToken = () => randomBytes(32).toString('base64url')
const normalizeEmail = (email: string) => email.trim().toLowerCase()

const { passwordHash: _hidden, ...userColumns } = getTableColumns(users)

export async function createUser(db: Db, input: { email: string; name: string; password: string }): Promise<User> {
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  const [row] = await db.insert(users)
    .values({ email: normalizeEmail(input.email), name: input.name, passwordHash: await hash(input.password) })
    .onConflictDoNothing({ target: users.email })
    .returning(userColumns)
  if (!row) throw new ConflictError('email_exists', 'a user with this email already exists')
  return row
}

// Verified against when the email is unknown, so both failures cost about the same.
let dummyHash: Promise<string> | undefined

export async function verifyPassword(db: Db, email: string, password: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)))
  if (!row) {
    dummyHash ??= hash('dummy password for timing')
    await verify(await dummyHash, password).catch(() => false)
    return undefined
  }
  const ok = await verify(row.passwordHash, password).catch(() => false)
  if (!ok) return undefined
  const { passwordHash: _, ...user } = row
  return user
}

export async function getUser(db: Db, id: string): Promise<User | undefined> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.id, id))
  return row
}

export async function findUserByEmail(db: Db, email: string): Promise<User | undefined> {
  const [row] = await db.select(userColumns).from(users).where(eq(users.email, normalizeEmail(email)))
  return row
}

/** The workspace a login lands in: the user's oldest membership (uuid v7 ids are time-ordered). */
export async function primaryMembership(db: Db, userId: string): Promise<{ workspaceId: string; role: Role } | undefined> {
  const [m] = await db.select({ workspaceId: workspaceMembers.workspaceId, role: workspaceMembers.role }).from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.workspaceId))
    .limit(1)
  return m && { workspaceId: m.workspaceId, role: m.role as Role }
}

export async function createWorkspaceWithOwner(
  db: Db,
  input: { name: string; userId: string; maxCostPerFilmUsd?: number | null; maxCostPerDayUsd?: number | null },
): Promise<Workspace> {
  return db.transaction(async (tx) => {
    const [ws] = await tx.insert(workspaces).values({
      name: input.name,
      maxCostPerFilmUsd: toNumeric(input.maxCostPerFilmUsd ?? null),
      maxCostPerDayUsd: toNumeric(input.maxCostPerDayUsd ?? null),
    }).returning()
    await tx.insert(workspaceMembers).values({ workspaceId: ws!.id, userId: input.userId, role: 'owner' })
    return toWorkspace(ws!)
  })
}

async function roleOf(db: Db, workspaceId: string, userId: string): Promise<Role | undefined> {
  const [m] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
  return m?.role as Role | undefined
}

export async function createSession(
  db: Db,
  input: { userId: string; workspaceId: string; ttlSec?: number },
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const token = randomToken()
  const csrfToken = randomToken()
  const expiresAt = new Date(Date.now() + (input.ttlSec ?? SESSION_TTL_SEC) * 1000)
  await db.insert(sessions).values({
    userId: input.userId, workspaceId: input.workspaceId, tokenHash: sha256Hex(token), csrfToken, expiresAt,
  })
  return { token, csrfToken, expiresAt }
}

export async function findSession(db: Db, token: string): Promise<Principal | undefined> {
  const [s] = await db.select().from(sessions).where(and(eq(sessions.tokenHash, sha256Hex(token)), gt(sessions.expiresAt, new Date())))
  if (!s) return undefined
  const role = await roleOf(db, s.workspaceId, s.userId)
  return role && { userId: s.userId, workspaceId: s.workspaceId, role, via: 'session', sessionId: s.id, csrfToken: s.csrfToken }
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256Hex(token)))
}

export async function createApiToken(
  db: Db,
  input: { workspaceId: string; userId: string; name: string },
): Promise<{ id: string; token: string }> {
  const token = `stk_${randomToken()}`
  const [row] = await db.insert(apiTokens)
    .values({ workspaceId: input.workspaceId, userId: input.userId, name: input.name, tokenHash: sha256Hex(token) })
    .returning({ id: apiTokens.id })
  return { id: row!.id, token }
}

export async function findApiToken(db: Db, token: string): Promise<Principal | undefined> {
  const [t] = await db.update(apiTokens).set({ lastUsedAt: new Date() })
    .where(and(eq(apiTokens.tokenHash, sha256Hex(token)), isNull(apiTokens.revokedAt)))
    .returning()
  if (!t) return undefined
  const role = await roleOf(db, t.workspaceId, t.userId)
  return role && { userId: t.userId, workspaceId: t.workspaceId, role, via: 'token', tokenId: t.id }
}
