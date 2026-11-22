import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { type TestApi, testApi } from './helpers.js'

const INDEX = '<!doctype html><title>Stick Studio</title>'
let root: string
let t: TestApi

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'stick-web-'))
  const webDir = join(root, 'dist')
  mkdirSync(join(webDir, 'assets'), { recursive: true })
  writeFileSync(join(webDir, 'index.html'), INDEX)
  writeFileSync(join(webDir, 'assets', 'app-abc123.js'), 'console.log(1)')
  writeFileSync(join(root, 'package.json'), '{"secret":true}')
})
afterEach(async () => {
  await t.close()
  rmSync(root, { recursive: true, force: true })
})

const withWeb = async () => { t = await testApi({ webDir: join(root, 'dist') }) }
const notFoundEnvelope = { data: null, error: { code: 'not_found' }, meta: { request_id: expect.any(String) } }

describe('SPA fallback', () => {
  test('GET /films/123 with Accept text/html serves index.html with cache-control no-cache', async () => {
    await withWeb()
    const res = await t.app.inject({ method: 'GET', url: '/films/123', headers: { accept: 'text/html' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(INDEX)
    expect(res.headers['content-type']).toMatch(/^text\/html/)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  test('GET / serves index.html', async () => {
    await withWeb()
    const res = await t.app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(INDEX)
  })

  test('GET /assets/app-abc123.js serves the file with cache-control public, max-age=31536000, immutable', async () => {
    await withWeb()
    const res = await t.app.inject({ method: 'GET', url: '/assets/app-abc123.js' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('console.log(1)')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
  })

  test('the shell and static files carry x-content-type-options nosniff', async () => {
    await withWeb()
    for (const url of ['/', '/films/123', '/assets/app-abc123.js']) {
      const res = await t.app.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(200)
      expect(res.headers['x-content-type-options'], url).toBe('nosniff')
    }
  })

  test('a missing hashed asset is the JSON 404, never index.html (a rebuild leaves old pages pointing at gone files)', async () => {
    await withWeb()
    for (const url of ['/assets/app-old.js', '/assets/app-old', '/favicon.ico']) {
      const res = await t.app.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(404)
      expect(res.json()).toMatchObject(notFoundEnvelope)
    }
  })

  test('GET /v1/nope is still the JSON 404 envelope, and GET /healthz is unchanged', async () => {
    await withWeb()
    const nope = await t.app.inject({ method: 'GET', url: '/v1/nope', headers: { accept: 'text/html' } })
    expect(nope.statusCode).toBe(404)
    expect(nope.json()).toMatchObject(notFoundEnvelope)
    const health = await t.app.inject({ method: 'GET', url: '/healthz' })
    expect(health.json()).toMatchObject({ data: { ok: true }, error: null })
  })

  test('GET /%2e%2e/package.json and /..%2fpackage.json never leave webDir', async () => {
    await withWeb()
    for (const url of ['/%2e%2e/package.json', '/..%2fpackage.json', '/assets/..%2f..%2fpackage.json', '/assets/%2e%2e/%2e%2e/package.json']) {
      const res = await t.app.inject({ method: 'GET', url })
      expect(res.body, url).not.toContain('secret')
      expect([200, 404]).toContain(res.statusCode)
      if (res.statusCode === 200) expect(res.body).toBe(INDEX)
    }
  })

  test('POST /films is the JSON 404 envelope (the fallback is GET and HEAD only)', async () => {
    await withWeb()
    const res = await t.app.inject({ method: 'POST', url: '/films', payload: {} })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject(notFoundEnvelope)
  })

  test('the html response has x-frame-options DENY and referrer-policy same-origin', async () => {
    await withWeb()
    const res = await t.app.inject({ method: 'GET', url: '/films/123' })
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('same-origin')
  })

  test('a direct GET /index.html carries the same headers, so the shell cannot be framed', async () => {
    await withWeb()
    const res = await t.app.inject({ method: 'GET', url: '/index.html' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe(INDEX)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('same-origin')
  })

  test('without webDir every unknown path is the JSON 404 envelope', async () => {
    t = await testApi()
    for (const url of ['/', '/films/123', '/assets/app-abc123.js']) {
      const res = await t.app.inject({ method: 'GET', url, headers: { accept: 'text/html' } })
      expect(res.statusCode, url).toBe(404)
      expect(res.json()).toMatchObject(notFoundEnvelope)
    }
  })
})
