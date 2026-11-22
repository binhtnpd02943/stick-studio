import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  type Db, archiveCharacter, audit, auditLog, createChannel, createCharacter, getChannel, getCharacter, getWorkspace,
  listChannels, listCharacters, updateChannel, updateCharacter, updateWorkspace,
} from '../src/index.js'
import { createTestDb, seedWorkspace } from '../src/testing.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

describe('channels', () => {
  test('a channel of workspace A is invisible from workspace B (get, list, update)', async () => {
    const a = await seedWorkspace(db)
    const b = await seedWorkspace(db)
    expect(await getChannel(db, b.workspace.id, a.channel.id)).toBeUndefined()
    expect((await listChannels(db, b.workspace.id, { limit: 10 })).items.map((c) => c.id)).not.toContain(a.channel.id)
    expect(await updateChannel(db, b.workspace.id, a.channel.id, { displayName: 'hijack' })).toBeUndefined()
    expect((await getChannel(db, a.workspace.id, a.channel.id))?.displayName).toBe(a.channel.displayName)
  })

  test('create applies defaults and update patches', async () => {
    const { workspace } = await seedWorkspace(db)
    const c = await createChannel(db, workspace.id, { platform: 'tiktok', displayName: 'Mine' })
    expect(c).toMatchObject({ locale: 'vi-VN', reviewPolicy: 'manual', autoScoreThreshold: null })
    const u = await updateChannel(db, workspace.id, c.id, { reviewPolicy: 'auto_if_score', autoScoreThreshold: 80 })
    expect(u).toMatchObject({ reviewPolicy: 'auto_if_score', autoScoreThreshold: 80, displayName: 'Mine' })
  })

  test('cursor paging returns every row once, newest first, and next_cursor null at the end', async () => {
    const { workspace, channel } = await seedWorkspace(db)
    const made = []
    for (let i = 0; i < 5; i++) made.push(await createChannel(db, workspace.id, { platform: 'tiktok', displayName: `c${i}` }))
    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    for (;;) {
      const p = await listChannels(db, workspace.id, { limit: 2, cursor })
      pages++
      seen.push(...p.items.map((c) => c.id))
      if (p.nextCursor === null) break
      cursor = p.nextCursor
    }
    expect(pages).toBe(3) // seed channel + 5, two per page
    expect(seen).toEqual([...made.map((c) => c.id).reverse(), channel.id])
  })
})

describe('characters', () => {
  test('archived characters drop out of the list but stay gettable', async () => {
    const a = await seedWorkspace(db)
    const b = await seedWorkspace(db)
    const keep = await createCharacter(db, a.workspace.id, { name: 'Keep', look: { color: 'red' }, voiceId: 'v1' })
    const gone = await createCharacter(db, a.workspace.id, { name: 'Gone' })
    expect(await archiveCharacter(db, b.workspace.id, gone.id)).toBeUndefined()
    expect((await archiveCharacter(db, a.workspace.id, gone.id))?.archivedAt).toBeInstanceOf(Date)
    expect((await listCharacters(db, a.workspace.id, { limit: 10 })).items.map((c) => c.id)).toEqual([keep.id])
    expect(await getCharacter(db, a.workspace.id, gone.id)).toBeDefined()
    expect(await getCharacter(db, b.workspace.id, keep.id)).toBeUndefined()
    expect((await updateCharacter(db, a.workspace.id, keep.id, { name: 'Kept' }))?.name).toBe('Kept')
    expect(await updateCharacter(db, b.workspace.id, keep.id, { name: 'x' })).toBeUndefined()
  })
})

describe('workspace', () => {
  test('updateWorkspace can clear a cap to null and leaves absent fields alone', async () => {
    const { workspace } = await seedWorkspace(db)
    const set = await updateWorkspace(db, workspace.id, { maxCostPerFilmUsd: 1.25, maxCostPerDayUsd: 7 })
    expect(set).toMatchObject({ maxCostPerFilmUsd: 1.25, maxCostPerDayUsd: 7 })
    const cleared = await updateWorkspace(db, workspace.id, { maxCostPerFilmUsd: null })
    expect(cleared).toMatchObject({ maxCostPerFilmUsd: null, maxCostPerDayUsd: 7, name: workspace.name })
    expect((await getWorkspace(db, workspace.id))?.maxCostPerFilmUsd).toBeNull()
  })

  test('audit writes rows scoped to the workspace, with and without an actor', async () => {
    const { workspace, user } = await seedWorkspace(db)
    const other = await seedWorkspace(db)
    await audit(db, workspace.id, { actorId: user.id, action: 'film.create', target: 'film:1', data: { a: 1 } })
    await audit(db, workspace.id, { action: 'x', target: 'y' })
    const rows = await db.select().from(auditLog).where(eq(auditLog.workspaceId, workspace.id)).orderBy(auditLog.id)
    expect(rows.map(({ actorId, action, target, data }) => ({ actorId, action, target, data }))).toEqual([
      { actorId: user.id, action: 'film.create', target: 'film:1', data: { a: 1 } },
      { actorId: null, action: 'x', target: 'y', data: null },
    ])
    expect(await db.select().from(auditLog).where(eq(auditLog.workspaceId, other.workspace.id))).toHaveLength(0)
  })
})
