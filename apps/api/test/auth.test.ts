import { createApiToken, createSession, createUser, apiTokens, workspaceMembers } from '@stick/db'
import { seedWorkspace } from '@stick/db/testing'
import { and, eq } from 'drizzle-orm'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { type TestApi, login, testApi } from './helpers.js'

let t: TestApi
beforeEach(async () => { t = await testApi() })
afterEach(async () => { await t.close() })

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

async function addMember(role: 'viewer' | 'editor') {
  const password = 'member-password-123'
  const user = await createUser(t.db, { email: `${role}-${Date.now()}@example.test`, name: role, password })
  await t.db.insert(workspaceMembers).values({ workspaceId: t.seeded.workspace.id, userId: user.id, role })
  const { token } = await createApiToken(t.db, { workspaceId: t.seeded.workspace.id, userId: user.id, name: role })
  return { user, password, token }
}

describe('session auth', () => {
  test('login sets an HttpOnly Secure SameSite=Lax cookie and returns a csrf token', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: t.seeded.user.email, password: t.seeded.password } })
    expect(res.statusCode).toBe(200)
    const header = String(res.headers['set-cookie'])
    expect(header).toMatch(/^sid=[A-Za-z0-9_-]{43};/)
    expect(header).toMatch(/HttpOnly/)
    expect(header).toMatch(/Secure/)
    expect(header).toMatch(/SameSite=Lax/)
    expect(header).toMatch(/Path=\//)
    expect(header).toMatch(/Max-Age=2592000/)
    expect(res.json().data.csrf_token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const me = await t.app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: `sid=${res.cookies[0]!.value}` } })
    expect(me.json().data).toEqual({
      user: { id: t.seeded.user.id, email: t.seeded.user.email, name: t.seeded.user.name },
      workspace: { id: t.seeded.workspace.id, name: t.seeded.workspace.name, role: 'owner' },
      csrf_token: res.json().data.csrf_token,
    })
  })

  test('wrong password and unknown email give the same 401 body', async () => {
    const wrong = await t.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: t.seeded.user.email, password: 'not the password' } })
    const unknown = await t.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'nobody@example.test', password: 'not the password' } })
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    const strip = (b: { error: unknown }) => b.error
    expect(strip(wrong.json())).toEqual(strip(unknown.json()))
    expect(wrong.json().error.code).toBe('unauthorized')
    expect(wrong.headers['set-cookie']).toBeUndefined()
  })

  test('cookie POST without x-csrf-token is 403 csrf_failed; with it, 200', async () => {
    const { cookie, csrf } = await login(t.app, t.seeded.user.email, t.seeded.password)
    const patch = (headers: Record<string, string>) =>
      t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers: { cookie, ...headers }, payload: { name: 'Renamed' } })
    const missing = await patch({})
    expect(missing.statusCode).toBe(403)
    expect(missing.json().error.code).toBe('csrf_failed')
    const wrong = await patch({ 'x-csrf-token': `${csrf.slice(0, -1)}x` })
    expect(wrong.json().error.code).toBe('csrf_failed')
    const right = await patch({ 'x-csrf-token': csrf })
    expect(right.statusCode).toBe(200)
    expect(right.json().data.name).toBe('Renamed')
    // Reads need no csrf token.
    expect((await t.app.inject({ method: 'GET', url: '/v1/workspace', headers: { cookie } })).statusCode).toBe(200)
  })

  test('logout ends the session', async () => {
    const { cookie, csrf } = await login(t.app, t.seeded.user.email, t.seeded.password)
    const out = await t.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { cookie, 'x-csrf-token': csrf } })
    expect(out.statusCode).toBe(200)
    expect(String(out.headers['set-cookie'])).toMatch(/^sid=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/)
    const me = await t.app.inject({ method: 'GET', url: '/v1/me', headers: { cookie } })
    expect(me.statusCode).toBe(401)
    expect(me.json().error.code).toBe('unauthorized')
  })

  test('revoked token and expired session are 401', async () => {
    const expired = await createSession(t.db, { userId: t.seeded.user.id, workspaceId: t.seeded.workspace.id, ttlSec: -1 })
    expect((await t.app.inject({ method: 'GET', url: '/v1/me', headers: { cookie: `sid=${expired.token}` } })).statusCode).toBe(401)

    expect((await t.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t.seeded.token) })).statusCode).toBe(200)
    await t.db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.userId, t.seeded.user.id))
    const revoked = await t.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t.seeded.token) })
    expect(revoked.statusCode).toBe(401)
    expect(revoked.json()).toMatchObject({ data: null, error: { code: 'unauthorized' } })
  })

  test('no credentials, a malformed Authorization header or an unknown token is 401', async () => {
    for (const headers of [{}, { authorization: 'Basic abc' }, bearer('stk_unknown'), { cookie: 'sid=unknown' }]) {
      const res = await t.app.inject({ method: 'GET', url: '/v1/me', headers })
      expect(res.statusCode, JSON.stringify(headers)).toBe(401)
    }
  })
})

describe('bearer tokens and roles', () => {
  test('bearer POST needs no csrf token', async () => {
    const res = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers: bearer(t.seeded.token), payload: { name: 'Via token' } })
    expect(res.statusCode).toBe(200)
    const out = await t.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: bearer(t.seeded.token) })
    expect(out.statusCode).toBe(200)
  })

  test('viewer cannot PATCH /v1/workspace (403) but can log out', async () => {
    const viewer = await addMember('viewer')
    const res = await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers: bearer(viewer.token), payload: { name: 'Nope' } })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('forbidden')
    expect((await t.app.inject({ method: 'GET', url: '/v1/workspace', headers: bearer(viewer.token) })).statusCode).toBe(200)

    const { cookie, csrf } = await login(t.app, viewer.user.email, viewer.password)
    const out = await t.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: { cookie, 'x-csrf-token': csrf } })
    expect(out.statusCode).toBe(200)
  })

  test('another workspace never sees this one, and a removed member is 401', async () => {
    const other = await seedWorkspace(t.db, { workspaceName: 'Other' })
    const res = await t.app.inject({ method: 'GET', url: '/v1/workspace', headers: bearer(other.token) })
    expect(res.json().data).toMatchObject({ id: other.workspace.id, name: 'Other' })

    const editor = await addMember('editor')
    await t.db.delete(workspaceMembers).where(and(eq(workspaceMembers.userId, editor.user.id), eq(workspaceMembers.workspaceId, t.seeded.workspace.id)))
    expect((await t.app.inject({ method: 'GET', url: '/v1/workspace', headers: bearer(editor.token) })).statusCode).toBe(401)
  })
})

describe('rate limits and logs', () => {
  test('login is rate limited to 10/min per IP', async () => {
    const attempt = (ip: string) => t.app.inject({
      method: 'POST', url: '/v1/auth/login', remoteAddress: ip, payload: { email: 'nobody@example.test', password: 'whatever-password' },
    })
    for (let i = 0; i < 10; i++) expect((await attempt('10.0.0.1')).statusCode).toBe(401)
    const limited = await attempt('10.0.0.1')
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toMatchObject({ data: null, error: { code: 'rate_limited' } })
    expect((await attempt('10.0.0.2')).statusCode).toBe(401)
  })

  test('unauthenticated requests are limited to 120/min per IP', async () => {
    const anon = (ip: string) => t.app.inject({ method: 'GET', url: '/v1/me', remoteAddress: ip })
    for (let i = 0; i < 120; i++) expect((await anon('10.0.1.1')).statusCode, `request ${i + 1}`).toBe(401)
    const limited = await anon('10.0.1.1')
    expect(limited.statusCode).toBe(429)
    expect(limited.json().error.code).toBe('rate_limited')
    expect((await anon('10.0.1.2')).statusCode).toBe(401)
  })

  test('the login counter is separate from the global per-IP counter', async () => {
    const ip = '10.0.2.1'
    const loginAttempt = () => t.app.inject({
      method: 'POST', url: '/v1/auth/login', remoteAddress: ip, payload: { email: 'nobody@example.test', password: 'whatever-password' },
    })
    // Exhaust the global budget: login still has its own 10.
    for (let i = 0; i < 121; i++) await t.app.inject({ method: 'GET', url: '/v1/me', remoteAddress: ip })
    expect((await t.app.inject({ method: 'GET', url: '/v1/me', remoteAddress: ip })).statusCode).toBe(429)
    for (let i = 0; i < 10; i++) expect((await loginAttempt()).statusCode).toBe(401)
    expect((await loginAttempt()).statusCode).toBe(429)

    // Exhausting login does not touch another IP's global budget, nor its own login allowance elsewhere.
    const other = '10.0.2.2'
    for (let i = 0; i < 11; i++) {
      await t.app.inject({ method: 'POST', url: '/v1/auth/login', remoteAddress: other, payload: { email: 'nobody@example.test', password: 'whatever-password' } })
    }
    expect((await t.app.inject({ method: 'GET', url: '/v1/me', remoteAddress: other })).statusCode).toBe(401)
  })

  test('login fails closed when the rate-limit store is down; other routes keep working', async () => {
    await t.close()
    // As in main.ts: no offline queue, so commands against a closed port fail at once.
    const down = new Redis('redis://127.0.0.1:1', { enableOfflineQueue: false, maxRetriesPerRequest: 1 }).on('error', () => {})
    try {
      t = await testApi({ redis: down })
      const started = Date.now()
      const res = await t.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: t.seeded.user.email, password: t.seeded.password } })
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(res.statusCode).toBe(500)
      expect(res.json()).toMatchObject({ data: null, error: { code: 'internal', message: 'login temporarily unavailable', details: {} } })
      expect(res.headers['set-cookie']).toBeUndefined()
      expect((await t.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t.seeded.token) })).statusCode).toBe(200)
    } finally {
      down.disconnect()
    }
  })

  test('logs never contain the bearer token, cookie or password', async () => {
    await t.close()
    const lines: string[] = []
    t = await testApi({ logStream: { write: (l) => { lines.push(l) } } })
    const { cookie, csrf } = await login(t.app, t.seeded.user.email, t.seeded.password)
    await t.app.inject({ method: 'GET', url: '/v1/me', headers: bearer(t.seeded.token) })
    await t.app.inject({ method: 'PATCH', url: '/v1/workspace', headers: { cookie, 'x-csrf-token': csrf }, payload: { name: 'Logged' } })
    // Something that does log the request headers and a password field must still be redacted.
    t.app.log.info({ req: { headers: { authorization: `Bearer ${t.seeded.token}`, cookie, 'x-csrf-token': csrf } }, password: t.seeded.password, body: { password: t.seeded.password } }, 'probe')

    const all = lines.join('')
    expect(lines.length).toBeGreaterThan(3)
    expect(all).toContain('probe')
    for (const secret of [t.seeded.token, cookie.slice(4), csrf, t.seeded.password]) expect(all).not.toContain(secret)
  })
})
