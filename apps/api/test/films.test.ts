import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { assetsOf, auditLog, createFilm, filmDetail, getFilm, replaceAsset, reviews, setFilmStatus } from '@stick/db'
import { seedWorkspace } from '@stick/db/testing'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { specExample } from '../../../packages/core/test/fixtures.js'
import { type TestApi, testApi } from './helpers.js'

let t: TestApi
beforeEach(async () => { t = await testApi() })
afterEach(async () => { await t.close() })

const auth = () => ({ authorization: `Bearer ${t.seeded.token}` })
const ws = () => t.seeded.workspace.id

async function create(payload: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return t.app.inject({ method: 'POST', url: '/v1/films', headers: { ...auth(), ...headers }, payload: { channel_id: t.seeded.channel.id, title: 'Phân số', ...payload } })
}

async function newFilm(): Promise<string> {
  const res = await create()
  expect(res.statusCode).toBe(201)
  return res.json().data.id
}

/** Walks a queued film through legal edges to `to`. */
async function moveTo(filmId: string, ...path: Parameters<typeof setFilmStatus>[3][]) {
  for (const s of path) expect(await setFilmStatus(t.db, ws(), filmId, s)).toBe(true)
}

const actions = (db: TestApi['db'], target: string) =>
  db.select().from(auditLog).where(eq(auditLog.target, target)).then((rows) => rows.map((r) => r.action))

describe('POST /v1/films', () => {
  test('POST /v1/films creates a queued film and enqueues story once', async () => {
    const res = await create({ brief: 'cho trẻ em' })
    expect(res.statusCode).toBe(201)
    const film = res.json().data
    expect(film).toMatchObject({ channel_id: t.seeded.channel.id, title: 'Phân số', brief: 'cho trẻ em', status: 'queued', current_version: 1, cost_usd: 0 })
    const detail = await filmDetail(t.db, ws(), film.id)
    expect(t.jobs).toEqual([{ workspaceId: ws(), filmId: film.id, filmVersionId: detail!.version.id, step: 'story' }])
    expect(await actions(t.db, `film:${film.id}`)).toEqual(['film.create'])
  })

  test('Idempotency-Key replay returns the same film and enqueues once; a different body is 409', async () => {
    const key = { 'idempotency-key': 'k-1' }
    const first = await create({}, key)
    expect(first.statusCode).toBe(201)
    const again = await create({}, key)
    expect(again.statusCode).toBe(200)
    expect(again.json().data.id).toBe(first.json().data.id)
    expect(t.jobs).toHaveLength(1)
    const other = await create({ title: 'Khác' }, key)
    expect(other.statusCode).toBe(409)
    expect(other.json().error.code).toBe('idempotency_conflict')
  })

  test('an enqueue failure is a 500; the replay enqueues the first step once', async () => {
    await t.close()
    t = await testApi({ enqueueFailures: 1 })
    const key = { 'idempotency-key': 'k-heal' }
    const failed = await create({}, key)
    expect(failed.statusCode).toBe(500)
    expect(failed.json().error.code).toBe('internal')
    expect(t.jobs).toHaveLength(0)

    const healed = await create({}, key)
    expect(healed.statusCode).toBe(200)
    const filmId = healed.json().data.id
    const detail = await filmDetail(t.db, ws(), filmId)
    expect(t.jobs).toEqual([{ workspaceId: ws(), filmId, filmVersionId: detail!.version.id, step: 'story' }])
    expect((await create({}, key)).statusCode).toBe(200)
    expect(t.jobs).toHaveLength(1)
  })

  test('a keyless create whose enqueue fails is a 500 and leaves the film failed, not queued without a job', async () => {
    await t.close()
    t = await testApi({ enqueueFailures: 1 })
    const failed = await create()
    expect(failed.statusCode).toBe(500)
    const list = await t.app.inject({ method: 'GET', url: '/v1/films', headers: auth() })
    expect(list.json().data).toMatchObject([{ status: 'failed' }])
    expect(t.jobs).toHaveLength(0)
  })

  test('a replay of a film that has started does not enqueue again', async () => {
    const key = { 'idempotency-key': 'k-started' }
    const id = (await create({}, key)).json().data.id
    t.jobs.length = 0
    await moveTo(id, 'running')
    expect((await create({}, key)).statusCode).toBe(200)
    expect(t.jobs).toHaveLength(0)
  })

  test('topic_id, a long title or a long Idempotency-Key is 400', async () => {
    for (const [payload, headers] of [
      [{ topic_id: t.seeded.channel.id }, {}],
      [{ title: 'x'.repeat(81) }, {}],
      [{ title: '' }, {}],
      [{ brief: 'x'.repeat(2001) }, {}],
      [{}, { 'idempotency-key': 'x'.repeat(201) }],
    ] as const) {
      const res = await create(payload, headers)
      expect(res.statusCode, JSON.stringify(payload)).toBe(400)
    }
    expect(t.jobs).toHaveLength(0)
  })

  test('channel of another workspace is 404', async () => {
    const other = await seedWorkspace(t.db)
    const res = await create({ channel_id: other.channel.id })
    expect(res.statusCode).toBe(404)
    expect(t.jobs).toHaveLength(0)
  })
})

describe('film routes', () => {
  test('film of another workspace is 404 on every film route', async () => {
    const other = await seedWorkspace(t.db)
    const { film } = await createFilm(t.db, other.workspace.id, { channelId: other.channel.id, title: 'theirs', createdBy: other.user.id })
    await setFilmStatus(t.db, other.workspace.id, film.id, 'cancelled')
    const base = `/v1/films/${film.id}`
    for (const [method, url, payload] of [
      ['GET', base, undefined],
      ['GET', `${base}/events`, undefined],
      ['GET', `${base}/versions`, undefined],
      ['POST', `${base}/redo`, { from_step: 'story', reason: 'r' }],
      ['POST', `${base}/cancel`, undefined],
      ['POST', `${base}/review`, { decision: 'approved' }],
      ['PATCH', `${base}/screenplay`, { screenplay: specExample() }],
    ] as const) {
      const res = await t.app.inject({ method, url, headers: auth(), ...(payload ? { payload } : {}) })
      expect(res.statusCode, `${method} ${url}`).toBe(404)
      expect(res.json().error.code).toBe('not_found')
    }
    expect((await getFilm(t.db, other.workspace.id, film.id))?.status).toBe('cancelled')
    expect(t.jobs).toHaveLength(0)
  })

  test('film routes need auth, including events', async () => {
    const id = await newFilm()
    for (const url of [`/v1/films/${id}`, `/v1/films/${id}/events`, `/v1/films/${id}/versions`, '/v1/films']) {
      const res = await t.app.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(401)
    }
  })

  test('detail has film, version, steps and assets', async () => {
    const id = await newFilm()
    const res = await t.app.inject({ method: 'GET', url: `/v1/films/${id}`, headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      film: { id, status: 'queued' }, version: { version: 1, reason: 'initial', restart_from_step: null }, steps: [], assets: [],
    })
  })

  test('detail version has id and created_at', async () => {
    const id = await newFilm()
    const { version } = (await filmDetail(t.db, ws(), id))!
    const res = await t.app.inject({ method: 'GET', url: `/v1/films/${id}`, headers: auth() })
    expect(res.json().data.version).toEqual({
      id: version.id, version: 1, reason: 'initial', restart_from_step: null, created_at: version.createdAt.toISOString(),
    })
  })

  test('versions lists every version newest first; another workspace\'s film is 404', async () => {
    const id = await newFilm()
    await moveTo(id, 'cancelled')
    const redo = await t.app.inject({ method: 'POST', url: `/v1/films/${id}/redo`, headers: auth(), payload: { from_step: 'voice', reason: 'louder' } })
    expect(redo.statusCode).toBe(202)
    const res = await t.app.inject({ method: 'GET', url: `/v1/films/${id}/versions`, headers: auth() })
    expect(res.statusCode).toBe(200)
    const versions = res.json().data
    expect(versions.map((v: { version: number; reason: string; restart_from_step: string | null }) => [v.version, v.reason, v.restart_from_step]))
      .toEqual([[2, 'louder', 'voice'], [1, 'initial', null]])
    expect(Object.keys(versions[0]).sort()).toEqual(['created_at', 'id', 'reason', 'restart_from_step', 'version'])
    expect(versions[0].id).toBe((await filmDetail(t.db, ws(), id))!.version.id)

    const other = await seedWorkspace(t.db)
    const missing = await t.app.inject({ method: 'GET', url: `/v1/films/${id}/versions`, headers: { authorization: `Bearer ${other.token}` } })
    expect(missing.statusCode).toBe(404)
  })

  test('film list items carry a timeline_url that downloads the timeline once it exists, else null', async () => {
    const id = await newFilm()
    const list = () => t.app.inject({ method: 'GET', url: '/v1/films', headers: auth() }).then((r) => r.json().data[0])
    expect((await list()).timeline_url).toBeNull()

    const { version } = (await filmDetail(t.db, ws(), id))!
    const body = Buffer.from('{"beats":[]}')
    const storageKey = `ws/${ws()}/films/${id}/v1/timeline.json`
    mkdirSync(dirname(t.storage.localPath(storageKey)), { recursive: true })
    writeFileSync(t.storage.localPath(storageKey), body)
    await replaceAsset(t.db, ws(), { filmVersionId: version.id, kind: 'timeline', path: 'timeline.json', storageKey, mime: 'application/json', bytes: body.length, sha256: 'x' })

    const { timeline_url } = await list()
    expect(timeline_url).toMatch(/^\/v1\/assets\/[^/]+\/content\?exp=\d+&sig=[0-9a-f]{64}$/)
    const got = await t.app.inject({ method: 'GET', url: timeline_url })
    expect(got.statusCode).toBe(200)
    expect(got.rawPayload.equals(body)).toBe(true)
  })

  test('cancel a queued film → cancelled; cancel again → 409', async () => {
    const id = await newFilm()
    const res = await t.app.inject({ method: 'POST', url: `/v1/films/${id}/cancel`, headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.film.status).toBe('cancelled')
    const again = await t.app.inject({ method: 'POST', url: `/v1/films/${id}/cancel`, headers: auth() })
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('conflict')
    expect(await actions(t.db, `film:${id}`)).toEqual(['film.create', 'film.cancel'])
  })

  test('a cancel racing a status change is 200 or 409, never 500', async () => {
    const id = await newFilm()
    await moveTo(id, 'running')
    const [res, moved] = await Promise.all([
      t.app.inject({ method: 'POST', url: `/v1/films/${id}/cancel`, headers: auth() }),
      setFilmStatus(t.db, ws(), id, 'awaiting_review'),
    ])
    const status = (await getFilm(t.db, ws(), id))!.status
    if (res.statusCode === 200) expect([status, moved]).toEqual(['cancelled', false])
    else {
      expect([res.statusCode, res.json().error.code, status, moved]).toEqual([409, 'conflict', 'awaiting_review', true])
    }
  })

  test('redo while running is 409; redo after failed creates version 2 restarting at from_step and enqueues it', async () => {
    const id = await newFilm()
    await moveTo(id, 'running')
    const redo = (payload: unknown) => t.app.inject({ method: 'POST', url: `/v1/films/${id}/redo`, headers: auth(), payload: payload as object })
    const running = await redo({ from_step: 'voice', reason: 'louder' })
    expect(running.statusCode).toBe(409)
    expect(running.json().error.code).toBe('conflict')

    await moveTo(id, 'failed')
    expect((await redo({ from_step: 'align', reason: 'x' })).statusCode).toBe(400)
    expect((await redo({ from_step: 'voice', reason: '' })).statusCode).toBe(400)
    const res = await redo({ from_step: 'voice', reason: 'louder' })
    expect(res.statusCode).toBe(202)
    expect(res.json().data).toMatchObject({ film: { status: 'queued', current_version: 2 }, version: { version: 2, reason: 'louder', restart_from_step: 'voice' } })
    const detail = await filmDetail(t.db, ws(), id)
    expect(t.jobs.at(-1)).toEqual({ workspaceId: ws(), filmId: id, filmVersionId: detail!.version.id, step: 'voice' })
    expect(await actions(t.db, `film:${id}`)).toContain('film.redo')
  })

  test('a redo whose enqueue fails is a 500 and leaves the film failed, so it can be redone', async () => {
    await t.close()
    t = await testApi({ enqueueFailures: 1 })
    const { film } = await createFilm(t.db, ws(), { channelId: t.seeded.channel.id, title: 'f', createdBy: t.seeded.user.id })
    await moveTo(film.id, 'running', 'failed')
    const payload = { from_step: 'story', reason: 'again' }
    const res = await t.app.inject({ method: 'POST', url: `/v1/films/${film.id}/redo`, headers: auth(), payload })
    expect(res.statusCode).toBe(500)
    expect((await getFilm(t.db, ws(), film.id))).toMatchObject({ status: 'failed', currentVersion: 2 })
    const retry = await t.app.inject({ method: 'POST', url: `/v1/films/${film.id}/redo`, headers: auth(), payload })
    expect(retry.statusCode).toBe(202)
    expect(t.jobs).toHaveLength(1)
  })

  test('review approve on awaiting_review → approved and a reviews row; approve again → 409', async () => {
    const id = await newFilm()
    const review = (payload: unknown) => t.app.inject({ method: 'POST', url: `/v1/films/${id}/review`, headers: auth(), payload: payload as object })
    expect((await review({ decision: 'approved' })).statusCode).toBe(409) // still queued
    await moveTo(id, 'running', 'awaiting_review')
    const res = await review({ decision: 'approved', reason: 'đẹp' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.film.status).toBe('approved')
    const detail = await filmDetail(t.db, ws(), id)
    const rows = await t.db.select().from(reviews).where(eq(reviews.filmVersionId, detail!.version.id))
    expect(rows).toMatchObject([{ decision: 'approved', reason: 'đẹp', reviewerId: t.seeded.user.id }])
    const again = await review({ decision: 'approved' })
    expect(again.statusCode).toBe(409)
    expect(again.json().error.code).toBe('conflict')
    expect(await actions(t.db, `film:${id}`)).toEqual(['film.create', 'film.review'])
  })

  test('review redo on qa_failed creates a new version', async () => {
    const id = await newFilm()
    const review = (payload: unknown) => t.app.inject({ method: 'POST', url: `/v1/films/${id}/review`, headers: auth(), payload: payload as object })
    await moveTo(id, 'running', 'qa_failed')
    const v1 = (await filmDetail(t.db, ws(), id))!.version
    expect((await review({ decision: 'redo' })).statusCode).toBe(400) // reason required
    const res = await review({ decision: 'redo', reason: 'too fast', redo_from_step: 'screenplay' })
    expect(res.statusCode).toBe(202)
    expect(res.json().data).toMatchObject({ film: { status: 'queued', current_version: 2 }, version: { version: 2, restart_from_step: 'screenplay' } })
    const rows = await t.db.select().from(reviews).where(eq(reviews.filmVersionId, v1.id))
    expect(rows).toMatchObject([{ decision: 'redo', reason: 'too fast', redoFromStep: 'screenplay' }])
    const v2 = (await filmDetail(t.db, ws(), id))!.version
    expect(t.jobs.at(-1)).toEqual({ workspaceId: ws(), filmId: id, filmVersionId: v2.id, step: 'screenplay' })
  })

  test('review redo on a cancelled film is 409', async () => {
    const id = await newFilm()
    await moveTo(id, 'cancelled')
    const res = await t.app.inject({ method: 'POST', url: `/v1/films/${id}/review`, headers: auth(), payload: { decision: 'redo', reason: 'r' } })
    expect(res.statusCode).toBe(409)
    expect((await getFilm(t.db, ws(), id))?.currentVersion).toBe(1)
  })

  test('PATCH screenplay with an unknown action is 422 with the issue; a valid one creates a version restarting at validate whose screenplay asset is the new one', async () => {
    const id = await newFilm()
    const patch = (screenplay: unknown) => t.app.inject({ method: 'PATCH', url: `/v1/films/${id}/screenplay`, headers: auth(), payload: { screenplay } })
    expect((await patch(specExample())).statusCode).toBe(409) // queued is not redoable
    await moveTo(id, 'running', 'awaiting_review')

    const schemaBad = await patch({ version: 2 })
    expect(schemaBad.statusCode).toBe(422)
    expect(schemaBad.json().error.code).toBe('invalid_screenplay')
    expect(typeof schemaBad.json().error.details.issues[0]).toBe('string')

    const bad = specExample()
    bad.scenes[0]!.beats[0]!.do![0]!.action = 'moonwalk'
    const unknown = await patch(bad)
    expect(unknown.statusCode).toBe(422)
    expect(unknown.json().error).toMatchObject({ code: 'invalid_screenplay', details: { issues: [{ code: 'unknown_action', key: 'moonwalk' }] } })
    expect((await getFilm(t.db, ws(), id))?.currentVersion).toBe(1)

    const good = { ...specExample(), title: 'edited' }
    const res = await patch(good)
    expect(res.statusCode).toBe(202)
    expect(res.json().data.version).toMatchObject({ version: 2, restart_from_step: 'validate' })
    const v2 = (await filmDetail(t.db, ws(), id))!.version
    const sp = (await assetsOf(t.db, ws(), v2.id)).filter((a) => a.kind === 'screenplay')
    expect(sp).toHaveLength(1)
    expect(sp[0]!.meta?.path).toBe('screenplay.json')
    expect(sp[0]!.storageKey).toMatch(new RegExp(`^ws/${ws()}/films/${id}/v2/screenplay\\.[0-9a-f-]{36}\\.json$`))
    expect(JSON.parse(readFileSync(t.storage.localPath(sp[0]!.storageKey), 'utf8')).title).toBe('edited')
    expect(t.jobs.at(-1)).toEqual({ workspaceId: ws(), filmId: id, filmVersionId: v2.id, step: 'validate' })
  })

  describe('film events', () => {
    const post = (id: string, path: string, payload?: unknown) =>
      t.app.inject({ method: 'POST', url: `/v1/films/${id}/${path}`, headers: auth(), payload: payload as object })
    const iso = expect.stringMatching(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/)

    test('cancel publishes a film event with status cancelled', async () => {
      const id = await newFilm()
      expect((await post(id, 'cancel')).statusCode).toBe(200)
      expect(t.events).toEqual([{ type: 'film', filmId: id, status: 'cancelled', at: iso }])
    })

    test('redo, review redo and a screenplay edit publish status queued; approve publishes approved', async () => {
      const id = await newFilm()
      await moveTo(id, 'running', 'failed')
      expect((await post(id, 'redo', { from_step: 'voice', reason: 'x' })).statusCode).toBe(202)
      await moveTo(id, 'running', 'qa_failed')
      expect((await post(id, 'review', { decision: 'redo', reason: 'y' })).statusCode).toBe(202)
      await moveTo(id, 'running', 'awaiting_review')
      const patch = await t.app.inject({ method: 'PATCH', url: `/v1/films/${id}/screenplay`, headers: auth(), payload: { screenplay: specExample() } })
      expect(patch.statusCode).toBe(202)
      await moveTo(id, 'running', 'awaiting_review')
      expect((await post(id, 'review', { decision: 'approved' })).statusCode).toBe(200)
      expect(t.events).toEqual(['queued', 'queued', 'queued', 'approved'].map((status) => ({ type: 'film', filmId: id, status, at: iso })))
    })

    test('a keyless create whose enqueue fails publishes status failed', async () => {
      await t.close()
      t = await testApi({ enqueueFailures: 1 })
      expect((await create()).statusCode).toBe(500)
      expect(t.events).toEqual([{ type: 'film', filmId: expect.any(String), status: 'failed', at: iso }])
    })

    test('a redo whose enqueue fails publishes queued then failed', async () => {
      await t.close()
      t = await testApi({ enqueueFailures: 1 })
      const { film } = await createFilm(t.db, ws(), { channelId: t.seeded.channel.id, title: 'f', createdBy: t.seeded.user.id })
      await moveTo(film.id, 'running', 'failed')
      expect((await post(film.id, 'redo', { from_step: 'story', reason: 'again' })).statusCode).toBe(500)
      expect(t.events.map((e) => e.type === 'film' && e.status)).toEqual(['queued', 'failed'])
    })

    test('a publish failure is logged and the action still succeeds', async () => {
      await t.close()
      const lines: string[] = []
      t = await testApi({ logStream: { write: (l) => { lines.push(l) } }, publish: async () => { throw new Error('redis down') } })
      const id = await newFilm()
      expect((await post(id, 'cancel')).statusCode).toBe(200)
      expect(lines.map((l) => JSON.parse(l) as { msg?: string }).some((l) => l.msg === 'could not publish film event')).toBe(true)
    })

    test('a publish that never settles is abandoned: the action still succeeds and the timeout is logged', async () => {
      await t.close()
      const lines: string[] = []
      t = await testApi({ logStream: { write: (l) => { lines.push(l) } }, publish: () => new Promise(() => {}) })
      const id = await newFilm()
      expect((await post(id, 'cancel')).statusCode).toBe(200)
      const logged = lines.map((l) => JSON.parse(l) as { msg?: string; err?: { message?: string } }).find((l) => l.msg === 'could not publish film event')
      expect(logged?.err?.message).toMatch(/timed out/)
    })

    test('a rejected transition publishes nothing', async () => {
      const id = await newFilm()
      expect((await post(id, 'cancel')).statusCode).toBe(200)
      expect((await post(id, 'cancel')).statusCode).toBe(409)
      expect(t.events).toHaveLength(1)
    })
  })

  test('list filters by status and pages', async () => {
    const a = await newFilm()
    const b = await newFilm()
    const c = await newFilm()
    await moveTo(b, 'cancelled')
    const list = (q: string) => t.app.inject({ method: 'GET', url: `/v1/films${q}`, headers: auth() })

    const queued = await list('?status=queued&limit=1')
    expect(queued.json().data.map((f: { id: string }) => f.id)).toEqual([c])
    expect(queued.json().meta.next_cursor).toBe(c)
    const page2 = await list(`?status=queued&limit=1&cursor=${c}`)
    expect(page2.json().data.map((f: { id: string }) => f.id)).toEqual([a])
    expect(page2.json().meta.next_cursor).toBeNull()
    expect((await list('?status=cancelled')).json().data.map((f: { id: string }) => f.id)).toEqual([b])
    expect((await list(`?channel_id=${t.seeded.channel.id}`)).json().data).toHaveLength(3)
    expect((await list('?status=done')).statusCode).toBe(400)
  })
})
