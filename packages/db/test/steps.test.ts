import { STEP_FILES } from '@stick/core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  type Db, ConflictError, assetKindOf, assetsOf, createFilm, findSucceededRun, finishRun, getAsset, insertReview,
  replaceAsset, startRun, stepRuns,
} from '../src/index.js'
import { eq } from 'drizzle-orm'
import { createTestDb, seedWorkspace } from '../src/testing.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

async function newVersion() {
  const s = await seedWorkspace(db)
  const { film, version } = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title: 'F', createdBy: s.user.id })
  return { ...s, ws: s.workspace.id, film, version }
}

describe('step runs', () => {
  test('findSucceededRun matches only same version, step and hash', async () => {
    const a = await newVersion()
    const b = await newVersion()
    const run = await startRun(db, { versionId: a.version.id, step: 'story', attempt: 1, inputHash: 'h1' })
    expect(await findSucceededRun(db, a.version.id, 'story', 'h1')).toBeUndefined() // still running
    const done = await finishRun(db, run.id, { status: 'succeeded' })
    expect(done).toMatchObject({ status: 'succeeded', error: null })
    expect(done?.finishedAt).toBeInstanceOf(Date)
    expect((await findSucceededRun(db, a.version.id, 'story', 'h1'))?.id).toBe(run.id)
    expect(await findSucceededRun(db, a.version.id, 'story', 'h2')).toBeUndefined()
    expect(await findSucceededRun(db, a.version.id, 'screenplay', 'h1')).toBeUndefined()
    expect(await findSucceededRun(db, b.version.id, 'story', 'h1')).toBeUndefined()
  })

  test('a stalled re-delivery with the same attempt reuses the row instead of violating UNIQUE', async () => {
    const { version } = await newVersion()
    await startRun(db, { versionId: version.id, step: 'voice', attempt: 1, inputHash: 'h' }) // worker crashed here
    const again = await startRun(db, { versionId: version.id, step: 'voice', attempt: 1, inputHash: 'h' })
    expect(again.status).toBe('running')
    await finishRun(db, again.id, { status: 'succeeded' })
    const rows = await db.select().from(stepRuns).where(eq(stepRuns.filmVersionId, version.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'succeeded', attempt: 1 })
  })

  test('a failed run restarted with the same attempt is reset to running', async () => {
    const { version } = await newVersion()
    const r = await startRun(db, { versionId: version.id, step: 'gate', attempt: 1, inputHash: 'h' })
    await finishRun(db, r.id, { status: 'failed', error: { code: 'x' } })
    const again = await startRun(db, { versionId: version.id, step: 'gate', attempt: 1, inputHash: 'h' })
    expect(again).toMatchObject({ id: r.id, status: 'running', error: null, finishedAt: null })
  })

  test('starting an already succeeded (version, step, attempt) is a conflict', async () => {
    const { version } = await newVersion()
    const r = await startRun(db, { versionId: version.id, step: 'story', attempt: 1, inputHash: 'h' })
    await finishRun(db, r.id, { status: 'succeeded' })
    await expect(startRun(db, { versionId: version.id, step: 'story', attempt: 1, inputHash: 'h' })).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('assets', () => {
  test('replaceAsset keeps one row per version and path', async () => {
    const { ws, version } = await newVersion()
    const base = { filmVersionId: version.id, kind: 'story', path: 'story.json', mime: 'application/json', bytes: 10, sha256: 'a' }
    await replaceAsset(db, ws, { ...base, storageKey: 'k1' })
    const second = await replaceAsset(db, ws, { ...base, storageKey: 'k2', meta: { title: 't', logline: 'l' } })
    await replaceAsset(db, ws, { ...base, kind: 'screenplay', path: 'screenplay.json', storageKey: 'k3' })
    const rows = await assetsOf(db, ws, version.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((a) => a.meta?.path === 'story.json')).toMatchObject({ id: second.id, storageKey: 'k2', meta: { path: 'story.json', title: 't', logline: 'l' } })
  })

  test('assets are scoped to their workspace', async () => {
    const a = await newVersion()
    const b = await newVersion()
    const made = await replaceAsset(db, a.ws, { filmVersionId: a.version.id, kind: 'final', path: 'film.mp4', storageKey: 'k', mime: 'video/mp4', bytes: 1, sha256: 's' })
    expect((await getAsset(db, a.ws, made.id))?.id).toBe(made.id)
    expect(await getAsset(db, b.ws, made.id)).toBeUndefined()
    expect(await assetsOf(db, b.ws, a.version.id)).toEqual([])
  })

  test('assetKindOf maps every STEP_FILES write', () => {
    const expected: Record<string, string> = {
      'story.json': 'story', 'screenplay.json': 'screenplay', 'audio/l001.wav': 'audio', 'timeline.json': 'timeline',
      'gate.json': 'qa_report', 'film.mp4': 'final', 'contact.png': 'contact_sheet',
    }
    const writes = Object.values(STEP_FILES).flatMap((f) => f.writes).map((w) => (w.endsWith('/') ? `${w}l001.wav` : w))
    expect(writes.sort()).toEqual(Object.keys(expected).sort())
    for (const w of writes) expect(assetKindOf(w)).toBe(expected[w])
    expect(assetKindOf('stray.txt')).toBeUndefined()
  })
})

describe('reviews', () => {
  test('insertReview stores a decision', async () => {
    const { user, version } = await newVersion()
    const r = await insertReview(db, { filmVersionId: version.id, reviewerId: user.id, decision: 'redo', reason: 'too slow', redoFromStep: 'voice' })
    expect(r).toMatchObject({ filmVersionId: version.id, decision: 'redo', reason: 'too slow', redoFromStep: 'voice' })
  })
})
