import { and, desc, eq, isNull, lt } from 'drizzle-orm'
import type { Db } from '../client.js'
import { page } from '../pagination.js'
import { characters } from '../schema.js'

export type Character = typeof characters.$inferSelect

export interface CharacterInput {
  name: string
  look?: unknown
  voiceId?: string | null
  description?: string | null
}

const inWorkspace = (workspaceId: string, id: string) => and(eq(characters.workspaceId, workspaceId), eq(characters.id, id))

export async function listCharacters(db: Db, workspaceId: string, opts: { limit: number; cursor?: string }) {
  const rows = await db.select().from(characters)
    .where(and(eq(characters.workspaceId, workspaceId), isNull(characters.archivedAt), opts.cursor ? lt(characters.id, opts.cursor) : undefined))
    .orderBy(desc(characters.id))
    .limit(opts.limit + 1)
  return page(rows, opts.limit)
}

export async function getCharacter(db: Db, workspaceId: string, id: string): Promise<Character | undefined> {
  const [row] = await db.select().from(characters).where(inWorkspace(workspaceId, id))
  return row
}

export async function createCharacter(db: Db, workspaceId: string, input: CharacterInput): Promise<Character> {
  const [row] = await db.insert(characters).values({ ...input, workspaceId }).returning()
  return row!
}

export async function updateCharacter(db: Db, workspaceId: string, id: string, patch: Partial<CharacterInput>): Promise<Character | undefined> {
  const [row] = await db.update(characters).set(patch).where(inWorkspace(workspaceId, id)).returning()
  return row
}

export async function archiveCharacter(db: Db, workspaceId: string, id: string): Promise<Character | undefined> {
  const [row] = await db.update(characters).set({ archivedAt: new Date() }).where(inWorkspace(workspaceId, id)).returning()
  return row
}
