import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  type Db, ConflictError, assetsOf, createFilm, createVersion, filmDetail, finishRun, getFilm, listFilms, recentStories,
  replaceAsset, setFilmStatus, startRun,
} from '../src/index.js'
import { createTestDb, seedWorkspace } from '../src/testing.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

const asset = (filmVersionId: string, path: string, kind: string, meta?: Record<string, unknown>) =>
  ({ filmVersionId, path, kind, storageKey: `k/${filmVersionId}/${path}`, mime: 'application/octet-stream', bytes: 1, sha256: 'x', meta })

async function newFilm(title = 'A film') {
  const s = await seedWorkspace(db)
  const r = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title, createdBy: s.user.id })
  return { ...s, ws: s.workspace.id, ...r }
}

describe('films', () => {
  test('createFilm makes version 1 queued', async () => {
    const { film, version, created } = await newFilm()
    expect(created).toBe(true)
    expect(film).toMatchObject({ status: 'queued', currentVersion: 1, costUsd: 0 })
    expect(version).toMatchObject({ filmId: film.id, version: 1, reason: 'initial', restartFromStep: null, parentVersion: null })
  })

  test('same idempotency key returns the same film; different title throws idempotency_conflict', async () => {
    const s = await seedWorkspace(db)
    const input = { channelId: s.channel.id, title: 'T', brief: 'b', createdBy: s.user.id, idempotencyKey: 'key-1' }
    const first = await createFilm(db, s.workspace.id, input)
    const again = await createFilm(db, s.workspace.id, input)
    expect(again.created).toBe(false)
    expect(again.film.id).toBe(first.film.id)
    expect(again.version.id).toBe(first.version.id)
    const err = await createFilm(db, s.workspace.id, { ...input, title: 'other' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).code).toBe('idempotency_conflict')
    // the same key in another workspace is a different film
    const o = await seedWorkspace(db)
    const other = await createFilm(db, o.workspace.id, { ...input, channelId: o.channel.id, createdBy: o.user.id })
    expect(other.created).toBe(true)
  })

  test('concurrent creates with one idempotency key make one film', async () => {
    const s = await seedWorkspace(db)
    const input = { channelId: s.channel.id, title: 'T', createdBy: s.user.id, idempotencyKey: 'race' }
    const results = await Promise.all([1, 2, 3, 4].map(() => createFilm(db, s.workspace.id, input)))
    expect(new Set(results.map((r) => r.film.id)).size).toBe(1)
    expect(results.filter((r) => r.created)).toHaveLength(1)
  })

  test('setFilmStatus refuses an illegal edge and returns false', async () => {
    const { ws, film } = await newFilm()
    expect(await setFilmStatus(db, ws, film.id, 'running')).toBe(true)
    expect(await setFilmStatus(db, ws, film.id, 'awaiting_review')).toBe(true)
    expect(await setFilmStatus(db, ws, film.id, 'approved')).toBe(true)
    expect(await setFilmStatus(db, ws, film.id, 'running')).toBe(false)
    expect((await getFilm(db, ws, film.id))?.status).toBe('approved')
  })

  test('setFilmStatus with expectedVersion leaves a newer version untouched', async () => {
    const { ws, film } = await newFilm()
    await setFilmStatus(db, ws, film.id, 'cancelled')
    await createVersion(db, ws, film.id, { reason: 'redo', restartFrom: 'story' })
    expect(await setFilmStatus(db, ws, film.id, 'running', 2)).toBe(true)
    expect(await setFilmStatus(db, ws, film.id, 'failed', 1)).toBe(false) // a late v1 failure
    expect((await getFilm(db, ws, film.id))!.status).toBe('running')
    expect(await setFilmStatus(db, ws, film.id, 'failed', 2)).toBe(true)
  })

  test('cancel wins over a late running→awaiting_review', async () => {
    const { ws, film } = await newFilm()
    await setFilmStatus(db, ws, film.id, 'running')
    expect(await setFilmStatus(db, ws, film.id, 'cancelled')).toBe(true)
    expect(await setFilmStatus(db, ws, film.id, 'awaiting_review')).toBe(false)
    expect((await getFilm(db, ws, film.id))?.status).toBe('cancelled')
  })

  test('concurrent cancel and awaiting_review: exactly one wins', async () => {
    const { ws, film } = await newFilm()
    await setFilmStatus(db, ws, film.id, 'running')
    const [c, a] = await Promise.all([setFilmStatus(db, ws, film.id, 'cancelled'), setFilmStatus(db, ws, film.id, 'awaiting_review')])
    expect([c, a].filter(Boolean)).toHaveLength(1)
    expect((await getFilm(db, ws, film.id))?.status).toBe(c ? 'cancelled' : 'awaiting_review')
  })

  test('createVersion from voice copies story/screenplay assets, not audio or later', async () => {
    const { ws, film, version } = await newFilm()
    for (const [path, kind] of [['story.json', 'story'], ['screenplay.json', 'screenplay'], ['audio/l1.wav', 'audio'], ['timeline.json', 'timeline'], ['film.mp4', 'final']]) {
      await replaceAsset(db, ws, asset(version.id, path!, kind!))
    }
    await setFilmStatus(db, ws, film.id, 'running')
    await setFilmStatus(db, ws, film.id, 'awaiting_review')
    const v2 = await createVersion(db, ws, film.id, { reason: 'redo voice', restartFrom: 'voice' })
    expect(v2).toMatchObject({ version: 2, parentVersion: 1, reason: 'redo voice', restartFromStep: 'voice' })
    const copied = await assetsOf(db, ws, v2.id)
    expect(copied.map((a) => a.meta?.path).sort()).toEqual(['screenplay.json', 'story.json'])
    expect(copied.find((a) => a.meta?.path === 'story.json')?.storageKey).toBe(`k/${version.id}/story.json`)
    expect(await assetsOf(db, ws, version.id)).toHaveLength(5) // the parent keeps its rows
    expect(await getFilm(db, ws, film.id)).toMatchObject({ currentVersion: 2, status: 'queued' })
    const detail = await filmDetail(db, ws, film.id)
    expect(detail?.version.id).toBe(v2.id)
  })

  test('createVersion with a screenplay replaces screenplay.json', async () => {
    const { ws, film, version } = await newFilm()
    await replaceAsset(db, ws, asset(version.id, 'story.json', 'story'))
    await replaceAsset(db, ws, asset(version.id, 'screenplay.json', 'screenplay'))
    await setFilmStatus(db, ws, film.id, 'failed')
    const v2 = await createVersion(db, ws, film.id, {
      reason: 'edited', restartFrom: 'validate', screenplay: { storageKey: 'k/new/screenplay.json', bytes: 42, sha256: 'abc' },
    })
    const rows = await assetsOf(db, ws, v2.id)
    expect(rows).toHaveLength(2)
    expect(rows.find((a) => a.meta?.path === 'screenplay.json')).toMatchObject({ kind: 'screenplay', storageKey: 'k/new/screenplay.json', bytes: 42, sha256: 'abc' })
  })

  test('createVersion on a running film is a conflict', async () => {
    const { ws, film } = await newFilm()
    await setFilmStatus(db, ws, film.id, 'running')
    const err = await createVersion(db, ws, film.id, { reason: 'r', restartFrom: 'story' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ConflictError)
    expect((err as ConflictError).code).toBe('conflict')
    expect((await getFilm(db, ws, film.id))?.currentVersion).toBe(1)
  })

  test('film of workspace A is undefined from workspace B in get, list and filmDetail', async () => {
    const a = await newFilm()
    const b = await seedWorkspace(db)
    expect(await getFilm(db, b.workspace.id, a.film.id)).toBeUndefined()
    expect(await filmDetail(db, b.workspace.id, a.film.id)).toBeUndefined()
    expect((await listFilms(db, b.workspace.id, { limit: 100 })).items).toEqual([])
    expect(await setFilmStatus(db, b.workspace.id, a.film.id, 'cancelled')).toBe(false)
    await expect(createVersion(db, b.workspace.id, a.film.id, { reason: 'r', restartFrom: 'story' })).rejects.toThrow()
    expect((await listFilms(db, a.ws, { limit: 100 })).items.map((f) => f.id)).toEqual([a.film.id])
  })

  test('listFilms filters by status and channel and pages newest first', async () => {
    const s = await seedWorkspace(db)
    const ws = s.workspace.id
    const made = []
    for (let i = 0; i < 3; i++) made.push((await createFilm(db, ws, { channelId: s.channel.id, title: `f${i}`, createdBy: s.user.id })).film)
    await setFilmStatus(db, ws, made[0]!.id, 'cancelled')
    const p1 = await listFilms(db, ws, { limit: 2 })
    expect(p1.items.map((f) => f.id)).toEqual([made[2]!.id, made[1]!.id])
    const p2 = await listFilms(db, ws, { limit: 2, cursor: p1.nextCursor! })
    expect(p2).toEqual({ items: [expect.objectContaining({ id: made[0]!.id })], nextCursor: null })
    expect((await listFilms(db, ws, { limit: 10, status: 'cancelled' })).items.map((f) => f.id)).toEqual([made[0]!.id])
    expect((await listFilms(db, ws, { limit: 10, channelId: s.channel.id })).items).toHaveLength(3)
  })

  test('filmDetail returns the latest attempt per step of the current version', async () => {
    const { ws, film, version } = await newFilm()
    const r1 = await startRun(db, { versionId: version.id, step: 'story', attempt: 1, inputHash: 'h' })
    await finishRun(db, r1.id, { status: 'failed', error: { code: 'transient' } })
    const r2 = await startRun(db, { versionId: version.id, step: 'story', attempt: 2, inputHash: 'h' })
    await finishRun(db, r2.id, { status: 'succeeded' })
    await startRun(db, { versionId: version.id, step: 'screenplay', attempt: 1, inputHash: 'h2' })
    await replaceAsset(db, ws, asset(version.id, 'story.json', 'story'))
    const d = await filmDetail(db, ws, film.id)
    expect(d?.steps.map((s) => [s.step, s.attempt, s.status])).toEqual([['story', 2, 'succeeded'], ['screenplay', 1, 'running']])
    expect(d?.assets).toHaveLength(1)
  })

  test('recentStories reads title and logline from story assets of the channel, newest first', async () => {
    const s = await seedWorkspace(db)
    const ws = s.workspace.id
    for (const t of ['one', 'two']) {
      const { version } = await createFilm(db, ws, { channelId: s.channel.id, title: t, createdBy: s.user.id })
      await replaceAsset(db, ws, asset(version.id, 'story.json', 'story', { title: t, logline: `${t} line` }))
      await replaceAsset(db, ws, asset(version.id, 'screenplay.json', 'screenplay'))
    }
    expect(await recentStories(db, ws, s.channel.id)).toEqual([{ title: 'two', logline: 'two line' }, { title: 'one', logline: 'one line' }])
    expect(await recentStories(db, ws, s.channel.id, 1)).toHaveLength(1)
    const other = await seedWorkspace(db)
    expect(await recentStories(db, other.workspace.id, s.channel.id)).toEqual([])
  })

  test('recentStories lists a redone film once', async () => {
    const s = await seedWorkspace(db)
    const ws = s.workspace.id
    const { film, version } = await createFilm(db, ws, { channelId: s.channel.id, title: 'redo', createdBy: s.user.id })
    await replaceAsset(db, ws, asset(version.id, 'story.json', 'story', { title: 'redo', logline: 'l' }))
    for (let i = 0; i < 2; i++) {
      await setFilmStatus(db, ws, film.id, 'failed')
      await createVersion(db, ws, film.id, { reason: 'again', restartFrom: 'screenplay' })
    }
    expect(await recentStories(db, ws, s.channel.id)).toEqual([{ title: 'redo', logline: 'l' }])
  })
})
