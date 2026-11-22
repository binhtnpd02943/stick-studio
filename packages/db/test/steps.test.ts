import { STEP_FILES } from '@stick/core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  type Db, ConflictError, assetKindOf, assetsOf, createFilm, findSucceededRun, finishRun, getAsset, insertReview,
  createVersion, currentAssetIds, getFilm, replaceAsset, runsOf, setFilmStatus, startRun, stepRuns, sweepStaleRuns,
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

const MIN = 60_000
const ago = (ms: number) => new Date(Date.now() - ms)
const backdate = (runId: string, ms: number) => db.update(stepRuns).set({ startedAt: ago(ms) }).where(eq(stepRuns.id, runId))

describe('sweepStaleRuns', () => {
  test('fails running runs started before the cutoff and the film at that version', async () => {
    const f = await newVersion()
    await setFilmStatus(db, f.ws, f.film.id, 'running')
    const run = await startRun(db, { versionId: f.version.id, step: 'voice', attempt: 2, inputHash: 'h' })
    await backdate(run.id, 31 * MIN)
    const swept = await sweepStaleRuns(db, ago(30 * MIN))
    expect(swept).toEqual([{ runId: run.id, workspaceId: f.ws, filmId: f.film.id, versionId: f.version.id, step: 'voice', attempt: 2, filmFailed: true }])
    const [row] = await db.select().from(stepRuns).where(eq(stepRuns.id, run.id))
    expect(row).toMatchObject({ status: 'failed', error: { code: 'stale', message: 'the worker stopped during this step' } })
    expect(row?.finishedAt).toBeInstanceOf(Date)
    expect((await getFilm(db, f.ws, f.film.id))?.status).toBe('failed')
  })

  test('a fresh running run, a succeeded run and a run of an older version are not failed', async () => {
    const fresh = await newVersion()
    await setFilmStatus(db, fresh.ws, fresh.film.id, 'running')
    await startRun(db, { versionId: fresh.version.id, step: 'story', attempt: 1, inputHash: 'h' })
    const done = await newVersion()
    const doneRun = await startRun(db, { versionId: done.version.id, step: 'story', attempt: 1, inputHash: 'h' })
    await finishRun(db, doneRun.id, { status: 'succeeded' })
    await backdate(doneRun.id, 31 * MIN)
    const old = await newVersion()
    const oldRun = await startRun(db, { versionId: old.version.id, step: 'story', attempt: 1, inputHash: 'h' })
    await backdate(oldRun.id, 31 * MIN)
    await setFilmStatus(db, old.ws, old.film.id, 'cancelled')
    await createVersion(db, old.ws, old.film.id, { reason: 'redo', restartFrom: 'story' })

    const swept = await sweepStaleRuns(db, ago(30 * MIN))

    expect(swept.filter((r) => [fresh, done].some((f) => f.film.id === r.filmId))).toEqual([])
    expect(swept.filter((r) => r.filmId === old.film.id)).toEqual([expect.objectContaining({ runId: oldRun.id, filmFailed: false })])
    expect((await getFilm(db, old.ws, old.film.id))?.status).toBe('queued')
    expect((await getFilm(db, fresh.ws, fresh.film.id))?.status).toBe('running')
    expect((await runsOf(db, fresh.version.id))[0]?.status).toBe('running')
    expect((await runsOf(db, done.version.id))[0]?.status).toBe('succeeded')
  })

  test('finishRun on a swept run returns undefined and leaves it failed', async () => {
    const f = await newVersion()
    const run = await startRun(db, { versionId: f.version.id, step: 'story', attempt: 1, inputHash: 'h' })
    await backdate(run.id, 31 * MIN)
    await sweepStaleRuns(db, ago(30 * MIN))
    expect(await finishRun(db, run.id, { status: 'succeeded' })).toBeUndefined()
    const [row] = await db.select().from(stepRuns).where(eq(stepRuns.id, run.id))
    expect(row).toMatchObject({ status: 'failed', error: { code: 'stale' } })
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

describe('currentAssetIds', () => {
  const timeline = (ws: string, versionId: string) => replaceAsset(db, ws, {
    filmVersionId: versionId, kind: 'timeline', path: 'timeline.json', storageKey: `k/${versionId}`, mime: 'application/json', bytes: 1, sha256: 'x',
  })

  test('currentAssetIds returns the current version\'s asset per film and skips films without one and films of another workspace', async () => {
    const a = await newVersion()
    const b = await newVersion() // no timeline
    const c = await newVersion() // redo: only the new version's timeline counts
    const other = await newVersion()
    const ta = await timeline(a.ws, a.version.id)
    await timeline(other.ws, other.version.id)
    await timeline(c.ws, c.version.id)
    await setFilmStatus(db, c.ws, c.film.id, 'cancelled')
    const v2 = await createVersion(db, c.ws, c.film.id, { reason: 'redo', restartFrom: 'story' })
    const tc2 = await timeline(c.ws, v2.id)

    expect(await currentAssetIds(db, a.ws, [a.film.id], 'timeline')).toEqual(new Map([[a.film.id, ta.id]]))
    expect(await currentAssetIds(db, a.ws, [a.film.id, b.film.id, other.film.id], 'timeline')).toEqual(new Map([[a.film.id, ta.id]]))
    expect(await currentAssetIds(db, c.ws, [c.film.id], 'timeline')).toEqual(new Map([[c.film.id, tc2.id]]))
    expect(await currentAssetIds(db, a.ws, [a.film.id], 'final')).toEqual(new Map())
    expect(await currentAssetIds(db, a.ws, [], 'timeline')).toEqual(new Map())
  })
})
