import { auditLog, createApiToken, getWorkspace } from '@stick/db'
import { eq } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { buildApp } from '../src/app.js'
import { type TestApi, testApi } from './helpers.js'

let t: TestApi
beforeEach(async () => { t = await testApi() })
afterEach(async () => { await t.close() })

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

describe('envelope and errors', () => {
  test('every response is the envelope with meta.request_id', async () => {
    const ok = await t.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t.seeded.token) })
    expect(ok.json()).toMatchObject({ data: expect.any(Object), error: null, meta: { request_id: expect.any(String) } })
    expect(ok.headers['x-request-id']).toBe(ok.json().meta.request_id)
    // uuid v7 when the client sends none.
    expect(ok.json().meta.request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)

    const echoed = await t.app.inject({ method: 'GET', url: '/healthz', headers: { 'x-request-id': 'client-id-1' } })
    expect(echoed.json()).toEqual({ data: { ok: true }, error: null, meta: { request_id: 'client-id-1' } })
    // An unsafe client id is replaced, never echoed.
    const unsafe = await t.app.inject({ method: 'GET', url: '/healthz', headers: { 'x-request-id': 'a b\nc' } })
    expect(unsafe.json().meta.request_id).not.toContain(' ')

    for (const res of [
      await t.app.inject({ method: 'GET', url: '/v1/me' }),
      await t.app.inject({ method: 'GET', url: '/v1/nope', headers: bearer(t.seeded.token) }),
    ]) {
      expect(res.json()).toEqual({
        data: null,
        error: { code: expect.any(String), message: expect.any(String), details: expect.anything() },
        meta: { request_id: expect.any(String) },
      })
    }
    expect((await t.app.inject({ method: 'GET', url: '/v1/nope', headers: bearer(t.seeded.token) })).statusCode).toBe(404)
  })

  test('unknown body field is 400 bad_request with issue details', async () => {
    const res = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers: bearer(t.seeded.token), payload: { name: 'x', extra: 1 } })
    expect(res.statusCode).toBe(400)
    const { error } = res.json()
    expect(error.code).toBe('bad_request')
    expect(error.details).toEqual([expect.objectContaining({ code: 'unrecognized_keys', keys: ['extra'] })])

    const badJson = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers: { ...bearer(t.seeded.token), 'content-type': 'application/json' }, payload: '{nope' })
    expect(badJson.statusCode).toBe(400)
    expect(badJson.json().error.code).toBe('bad_request')
  })

  test('a thrown non-API error is 500 internal without stack or message', async () => {
    t.app.get('/v1/boom', async () => { throw new Error('Failed query: select password_hash from users where id = $1') })
    const res = await t.app.inject({ method: 'GET', url: '/v1/boom', headers: bearer(t.seeded.token) })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ data: null, error: { code: 'internal', message: 'internal error', details: {} }, meta: { request_id: expect.any(String) } })
    expect(res.body).not.toMatch(/select|password_hash|at .*\.ts/)
  })

  test('buildApp refuses an empty or short url signing key', async () => {
    const deps = { db: t.db, storage: {} as never, redis: {} as never, enqueue: async () => {}, subscribe: () => () => {} }
    for (const urlSigningKey of ['', 'short']) {
      await expect(buildApp({ ...deps, cfg: { urlSigningKey } as never })).rejects.toThrow(/STICK_URL_SIGNING_KEY must be at least 32/)
    }
  })
})

describe('openapi', () => {
  test('GET /v1/openapi.json lists every /v1 route registered', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/openapi.json' })
    expect(res.statusCode).toBe(200)
    const spec = res.json()
    expect(spec.openapi).toMatch(/^3\.1/)
    expect(spec.info.title).toBe('Stick Studio API')
    const routes = Object.entries(spec.paths as Record<string, object>).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`))
    expect(routes.sort()).toEqual([
      'GET /v1/me', 'GET /v1/workspace', 'PATCH /v1/workspace', 'POST /v1/auth/login', 'POST /v1/auth/logout',
      'GET /v1/channels', 'POST /v1/channels', 'GET /v1/channels/{id}', 'PATCH /v1/channels/{id}',
      'GET /v1/characters', 'POST /v1/characters', 'PATCH /v1/characters/{id}', 'DELETE /v1/characters/{id}',
      'GET /v1/assets/{id}/url', 'GET /v1/review-queue', 'GET /v1/usage',
      'POST /v1/films', 'GET /v1/films', 'GET /v1/films/{id}', 'GET /v1/films/{id}/events', 'POST /v1/films/{id}/redo',
      'POST /v1/films/{id}/cancel', 'POST /v1/films/{id}/review', 'PATCH /v1/films/{id}/screenplay',
    ].sort())
    expect(spec.paths['/v1/workspace'].patch.requestBody).toBeDefined()
  })
})

describe('workspace', () => {
  test('PATCH /v1/workspace sets and clears caps and writes audit_log', async () => {
    const headers = bearer(t.seeded.token)
    const set = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers, payload: { max_cost_per_film_usd: 0.5, max_cost_per_day_usd: 3 } })
    expect(set.statusCode).toBe(200)
    expect(set.json().data).toEqual({ id: t.seeded.workspace.id, name: t.seeded.workspace.name, plan: expect.any(String), max_cost_per_film_usd: 0.5, max_cost_per_day_usd: 3 })

    const cleared = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers, payload: { max_cost_per_film_usd: null } })
    expect(cleared.json().data).toMatchObject({ max_cost_per_film_usd: null, max_cost_per_day_usd: 3 })
    expect(await getWorkspace(t.db, t.seeded.workspace.id)).toMatchObject({ maxCostPerFilmUsd: null, maxCostPerDayUsd: 3 })

    const got = await t.app.inject({ method: 'GET', url: '/v1/workspace', headers })
    expect(got.json().data).toEqual(cleared.json().data)

    const rows = await t.db.select().from(auditLog).where(eq(auditLog.workspaceId, t.seeded.workspace.id))
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.action)).toEqual(['workspace.update', 'workspace.update'])
    expect(rows[1]).toMatchObject({ actorId: t.seeded.user.id, target: `workspace:${t.seeded.workspace.id}`, data: { max_cost_per_film_usd: null } })

    for (const payload of [{}, { name: '' }, { name: 'x'.repeat(81) }, { max_cost_per_day_usd: 0 }, { max_cost_per_day_usd: -1 }, { max_cost_per_day_usd: '1' }]) {
      const bad = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers, payload })
      expect(bad.statusCode, JSON.stringify(payload)).toBe(400)
    }
  })
})

describe('health and rate limit', () => {
  test('healthz and readyz are public and ok', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/healthz' })).json().data).toEqual({ ok: true })
    const ready = await t.app.inject({ method: 'GET', url: '/readyz' })
    expect(ready.statusCode).toBe(200)
    expect(ready.json().data).toEqual({ db: 'ok', redis: 'ok' })
  })

  test('readyz is 503 naming redis when Redis is down', async () => {
    await t.close()
    // Port 1 is never a Redis; ioredis keeps retrying, so readyz must not wait on it.
    const down = new Redis('redis://127.0.0.1:1', { maxRetriesPerRequest: null }).on('error', () => {})
    try {
      t = await testApi({ redis: down })
      const started = Date.now()
      const res = await t.app.inject({ method: 'GET', url: '/readyz' })
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(res.statusCode).toBe(503)
      expect(res.json().data).toEqual({ db: 'ok', redis: 'down' })
      // Other routes still answer: the rate limiter skips a broken store.
      expect((await t.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200)
    } finally {
      down.disconnect()
    }
  })

  test('requests over 120/min per token are 429 rate_limited', async () => {
    const headers = bearer(t.seeded.token)
    for (let i = 0; i < 120; i++) {
      const res = await t.app.inject({ method: 'GET', url: '/v1/me', headers })
      expect(res.statusCode, `request ${i + 1}`).toBe(200)
    }
    const limited = await t.app.inject({ method: 'GET', url: '/v1/me', headers })
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toMatchObject({ data: null, error: { code: 'rate_limited' } })
    // The limit is per principal, not per IP.
    const other = await createApiToken(t.db, { workspaceId: t.seeded.workspace.id, userId: t.seeded.user.id, name: 'second' })
    expect((await t.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(other.token) })).statusCode).toBe(200)
    // Health checks are never limited.
    expect((await t.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200)
  })
})
