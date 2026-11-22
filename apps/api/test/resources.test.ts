import { LookSchema as CoreLookSchema } from '@stick/core'
import { createFilm, finishRun, replaceAsset, setFilmStatus, startRun, usageEvents } from '@stick/db'
import { seedWorkspace } from '@stick/db/testing'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { LookSchema } from '../src/schemas.js'
import { type TestApi, testApi } from './helpers.js'

let t: TestApi
beforeEach(async () => { t = await testApi() })
afterEach(async () => { await t.close() })

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const MISSING_ID = '01890000-0000-7000-8000-000000000000'
const look = { ink: '#112233', hair: 'ponytail' }

describe('channels', () => {
  test('channel CRUD round-trip; unknown review_policy is 400', async () => {
    const headers = bearer(t.seeded.token)
    const created = await t.app.inject({ method: 'POST', url: '/v1/channels', headers, payload: { display_name: 'Kids', auto_score_threshold: 80 } })
    expect(created.statusCode).toBe(200)
    const ch = created.json().data
    expect(ch).toMatchObject({ display_name: 'Kids', platform: 'tiktok', locale: 'vi-VN', review_policy: 'manual', auto_score_threshold: 80 })

    const got = await t.app.inject({ method: 'GET', url: `/v1/channels/${ch.id}`, headers })
    expect(got.json().data).toEqual(ch)

    const patched = await t.app.inject({ method: 'PATCH', url: `/v1/channels/${ch.id}`, headers, payload: { review_policy: 'auto_if_score', auto_score_threshold: null } })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().data).toMatchObject({ id: ch.id, display_name: 'Kids', review_policy: 'auto_if_score', auto_score_threshold: null })

    const list = await t.app.inject({ method: 'GET', url: '/v1/channels?limit=1', headers })
    expect(list.json().data.map((c: { id: string }) => c.id)).toEqual([ch.id])
    const next = list.json().meta.next_cursor
    expect(next).toBe(ch.id)
    const page2 = await t.app.inject({ method: 'GET', url: `/v1/channels?limit=1&cursor=${next}`, headers })
    expect(page2.json().data.map((c: { id: string }) => c.id)).toEqual([t.seeded.channel.id])
    expect(page2.json().meta.next_cursor).toBeNull()

    for (const [method, url, payload] of [
      ['POST', '/v1/channels', { display_name: 'X', review_policy: 'always' }],
      ['POST', '/v1/channels', { display_name: '' }],
      ['POST', '/v1/channels', { display_name: 'X', platform: 'youtube' }],
      ['POST', '/v1/channels', { display_name: 'X', auto_score_threshold: 101 }],
      ['PATCH', `/v1/channels/${ch.id}`, { review_policy: 'always' }],
      ['PATCH', `/v1/channels/${ch.id}`, { extra: 1 }],
    ] as const) {
      const bad = await t.app.inject({ method, url, headers, payload })
      expect(bad.statusCode, JSON.stringify(payload)).toBe(400)
      expect(bad.json().error.code).toBe('bad_request')
    }
  })

  test('a non-uuid cursor, limit over 100 or non-uuid id is 400', async () => {
    const headers = bearer(t.seeded.token)
    for (const url of ['/v1/channels?cursor=nope', '/v1/channels?limit=101', '/v1/characters?cursor=1', '/v1/review-queue?cursor=x', '/v1/channels/nope']) {
      const res = await t.app.inject({ method: 'GET', url, headers })
      expect(res.statusCode, url).toBe(400)
      expect(res.json().error.code).toBe('bad_request')
    }
  })
})

describe('characters', () => {
  test('character with a bad ink hex or unknown voice is 400', async () => {
    const headers = bearer(t.seeded.token)
    const ok = await t.app.inject({ method: 'POST', url: '/v1/characters', headers, payload: { name: 'Bo', look, voice_id: 'child', description: 'small' } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data).toMatchObject({ name: 'Bo', look, voice_id: 'child', description: 'small', archived_at: null })

    for (const payload of [
      { name: 'Bo', look: { ink: '#12345' }, voice_id: 'child' },
      { name: 'Bo', look: { ink: 'red' }, voice_id: 'child' },
      { name: 'Bo', look: { ink: '#123456', hair: 'mohawk' }, voice_id: 'child' },
      { name: 'Bo', look, voice_id: 'robot' },
      { name: 'x'.repeat(41), look, voice_id: 'child' },
      { name: 'Bo', look, voice_id: 'child', description: 'x'.repeat(501) },
    ]) {
      const bad = await t.app.inject({ method: 'POST', url: '/v1/characters', headers, payload })
      expect(bad.statusCode, JSON.stringify(payload)).toBe(400)
    }
    const badPatch = await t.app.inject({ method: 'PATCH', url: `/v1/characters/${ok.json().data.id}`, headers, payload: { voice_id: 'robot' } })
    expect(badPatch.statusCode).toBe(400)
    const patched = await t.app.inject({ method: 'PATCH', url: `/v1/characters/${ok.json().data.id}`, headers, payload: { name: 'Bob' } })
    expect(patched.json().data).toMatchObject({ name: 'Bob', look, voice_id: 'child' })
  })

  test('the API look schema accepts and rejects the same looks as core', () => {
    const cases = [
      { ink: '#aabbcc' }, { ink: '#AABBCC', hair: 'none' }, look, { ink: '#abc' }, { ink: 'aabbcc' }, { ink: '#aabbcg' },
      { ink: '#aabbcc', hair: 'bald' }, {}, { hair: 'short' }, { ink: 1 }, { ink: '#aabbcc', extra: 1 }, null,
    ]
    for (const c of cases) expect(LookSchema.safeParse(c).success, JSON.stringify(c)).toBe(CoreLookSchema.safeParse(c).success)
  })

  test('DELETE archives and the list hides it', async () => {
    const headers = bearer(t.seeded.token)
    const ids: string[] = []
    for (const name of ['A', 'B']) {
      const res = await t.app.inject({ method: 'POST', url: '/v1/characters', headers, payload: { name, look, voice_id: 'narrator' } })
      ids.push(res.json().data.id)
    }
    const del = await t.app.inject({ method: 'DELETE', url: `/v1/characters/${ids[0]}`, headers })
    expect(del.statusCode).toBe(200)
    expect(del.json().data).toMatchObject({ id: ids[0], name: 'A', archived_at: expect.any(String) })
    const list = await t.app.inject({ method: 'GET', url: '/v1/characters', headers })
    expect(list.json().data.map((c: { id: string }) => c.id)).toEqual([ids[1]])
    expect(list.json().meta.next_cursor).toBeNull()
  })
})

describe('tenancy', () => {
  test('channel and character of another workspace are 404 on get, patch, delete', async () => {
    const other = await seedWorkspace(t.db, { workspaceName: 'Other' })
    const theirChar = await t.app.inject({ method: 'POST', url: '/v1/characters', headers: bearer(other.token), payload: { name: 'Them', look, voice_id: 'child' } })
    const headers = bearer(t.seeded.token)
    const requests = (id: string) => [
      { method: 'GET', url: `/v1/channels/${id}` },
      { method: 'PATCH', url: `/v1/channels/${id}`, payload: { display_name: 'Mine now' } },
      { method: 'PATCH', url: `/v1/characters/${id}`, payload: { name: 'Mine now' } },
      { method: 'DELETE', url: `/v1/characters/${id}` },
    ] as const
    const strip = (body: { meta: object }) => ({ ...body, meta: {} })
    for (const [i, req] of requests(MISSING_ID).entries()) {
      const theirId = req.url.includes('channels') ? other.channel.id : theirChar.json().data.id
      const theirs = await t.app.inject({ ...requests(theirId)[i]!, headers })
      const missing = await t.app.inject({ ...req, headers })
      expect(theirs.statusCode, req.url).toBe(404)
      expect(strip(theirs.json())).toEqual(strip(missing.json()))
      expect(theirs.json().error.code).toBe('not_found')
    }
    // Nothing changed on their side, and their rows never show in our lists.
    const ourList = await t.app.inject({ method: 'GET', url: '/v1/channels', headers })
    expect(ourList.json().data.map((c: { id: string }) => c.id)).toEqual([t.seeded.channel.id])
    const theirList = await t.app.inject({ method: 'GET', url: '/v1/characters', headers: bearer(other.token) })
    expect(theirList.json().data).toMatchObject([{ name: 'Them', archived_at: null }])
  })
})

describe('review queue', () => {
  test('review-queue lists awaiting_review and qa_failed only, oldest first, with a signed final_url and findings for qa_failed', async () => {
    const ws = t.seeded.workspace.id
    const film = async (title: string, to?: 'awaiting_review' | 'qa_failed' | 'failed') => {
      const { film: f, version } = await createFilm(t.db, ws, { channelId: t.seeded.channel.id, title, createdBy: t.seeded.user.id })
      if (to) {
        await setFilmStatus(t.db, ws, f.id, 'running')
        await setFilmStatus(t.db, ws, f.id, to)
      }
      return { f, version }
    }
    const a = await film('A', 'qa_failed')
    await film('queued')
    const b = await film('B', 'awaiting_review')
    await film('failed', 'failed')
    const c = await film('C', 'qa_failed')

    const findings = { code: 'gate', message: 'pacing gate failed', details: { issues: ['beat b1 too fast'] } }
    const run = await startRun(t.db, { versionId: a.version.id, step: 'gate', attempt: 1, inputHash: 'h' })
    await finishRun(t.db, run.id, { status: 'failed', error: findings })
    const asset = (versionId: string, kind: string, path: string) => replaceAsset(t.db, ws, {
      filmVersionId: versionId, kind, path, storageKey: `k/${path}`, mime: 'video/mp4', bytes: 1, sha256: 'x',
    })
    const final = await asset(b.version.id, 'final', 'film.mp4')
    const contact = await asset(b.version.id, 'contact_sheet', 'contact.png')

    const headers = bearer(t.seeded.token)
    const res = await t.app.inject({ method: 'GET', url: '/v1/review-queue?limit=2', headers })
    expect(res.statusCode).toBe(200)
    const items = res.json().data
    expect(items.map((i: { film: { title: string } }) => i.film.title)).toEqual(['A', 'B'])
    expect(items[0]).toEqual({
      film: { id: a.f.id, title: 'A', status: 'qa_failed', cost_usd: 0, current_version: 1 },
      final_asset_id: null, contact_asset_id: null, final_url: null, findings,
    })
    expect(items[1]).toEqual({
      film: { id: b.f.id, title: 'B', status: 'awaiting_review', cost_usd: 0, current_version: 1 },
      final_asset_id: final.id, contact_asset_id: contact.id,
      final_url: expect.stringMatching(new RegExp(`^/v1/assets/${final.id}/content\\?exp=\\d+&sig=[0-9a-f]{64}$`)), findings: null,
    })
    expect(res.json().meta.next_cursor).toBe(b.f.id)
    const page2 = await t.app.inject({ method: 'GET', url: `/v1/review-queue?cursor=${b.f.id}`, headers })
    expect(page2.json().data.map((i: { film: { id: string } }) => i.film.id)).toEqual([c.f.id])
    expect(page2.json().meta.next_cursor).toBeNull()

    const other = await seedWorkspace(t.db, { workspaceName: 'Other' })
    expect((await t.app.inject({ method: 'GET', url: '/v1/review-queue', headers: bearer(other.token) })).json().data).toEqual([])
  })
})

describe('usage', () => {
  test('usage groups the seeded usage_events by day, provider and film; a 400-day range is 400', async () => {
    const ws = t.seeded.workspace.id
    const { film, version } = await createFilm(t.db, ws, { channelId: t.seeded.channel.id, title: 'Spendy', createdBy: t.seeded.user.id })
    const event = (day: string, provider: string, costUsd: string) => ({
      workspaceId: ws, filmVersionId: version.id, step: 'story', provider, model: 'm', costUsd, createdAt: new Date(`${day}T12:00:00Z`),
    })
    await t.db.insert(usageEvents).values([
      event('2026-11-01', 'anthropic', '0.25'), event('2026-11-01', 'tts', '0.5'), event('2026-11-02', 'anthropic', '1'),
      event('2026-10-01', 'anthropic', '9'), // outside the range
    ])
    const headers = bearer(t.seeded.token)
    const res = await t.app.inject({ method: 'GET', url: '/v1/usage?from=2026-11-01&to=2026-11-02', headers })
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.total_usd).toBe(1.75)
    expect(data.by_day).toEqual([{ day: '2026-11-01', cost_usd: 0.75 }, { day: '2026-11-02', cost_usd: 1 }])
    expect([...data.by_provider].sort((x: { provider: string }, y: { provider: string }) => x.provider.localeCompare(y.provider)))
      .toEqual([{ provider: 'anthropic', model: 'm', cost_usd: 1.25 }, { provider: 'tts', model: 'm', cost_usd: 0.5 }])
    expect(data.by_film).toEqual([{ film_id: film.id, title: 'Spendy', cost_usd: 1.75 }])

    // Default range: the last 30 UTC days.
    const dflt = await t.app.inject({ method: 'GET', url: '/v1/usage', headers })
    expect(dflt.statusCode).toBe(200)
    expect(dflt.json().data).toMatchObject({ total_usd: expect.any(Number), by_day: expect.any(Array) })

    for (const q of ['from=2025-01-01&to=2026-02-05', 'from=2026-11-03&to=2026-11-01', 'from=2026-13-01&to=2026-11-01', 'from=yesterday']) {
      const bad = await t.app.inject({ method: 'GET', url: `/v1/usage?${q}`, headers })
      expect(bad.statusCode, q).toBe(400)
      expect(bad.json().error.code).toBe('bad_request')
    }
    expect((await t.app.inject({ method: 'GET', url: '/v1/usage?from=2025-11-01&to=2026-11-01', headers })).statusCode).toBe(200)
  })
})
