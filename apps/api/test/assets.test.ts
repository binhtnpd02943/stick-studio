import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createFilm, replaceAsset } from '@stick/db'
import { seedWorkspace } from '@stick/db/testing'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ASSET_URL_TTL_S, signAsset, verifyAsset } from '../src/signing.js'
import { TEST_SIGNING_KEY, type TestApi, testApi } from './helpers.js'

let t: TestApi
beforeEach(async () => { t = await testApi() })
afterEach(async () => { await t.close() })

const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
const MISSING_ID = '01890000-0000-7000-8000-000000000000'
const BYTES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))

/** A 1000-byte asset in `workspace`, written to the test storage. */
async function makeAsset(seeded: TestApi['seeded'], mime = 'video/mp4') {
  const ws = seeded.workspace.id
  const { film, version } = await createFilm(t.db, ws, { channelId: seeded.channel.id, title: 'F', createdBy: seeded.user.id })
  const storageKey = `ws/${ws}/films/${film.id}/v1/film.mp4`
  const path = t.storage.localPath(storageKey)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, BYTES)
  return replaceAsset(t.db, ws, { filmVersionId: version.id, kind: 'final', path: 'film.mp4', storageKey, mime, bytes: BYTES.length, sha256: 'x' })
}

async function signedUrl(id: string): Promise<string> {
  const res = await t.app.inject({ method: 'GET', url: `/v1/assets/${id}/url`, headers: bearer(t.seeded.token) })
  expect(res.statusCode).toBe(200)
  return res.json().data.url
}

describe('signing', () => {
  const exp = Math.floor(Date.now() / 1000) + 60

  test('verifyAsset accepts its own signature and rejects tampering, expiry and malformed sigs without throwing', () => {
    const sig = signAsset('a1', exp, TEST_SIGNING_KEY)
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
    expect(verifyAsset('a1', exp, sig, TEST_SIGNING_KEY)).toBe(true)
    expect(verifyAsset('a2', exp, sig, TEST_SIGNING_KEY)).toBe(false)
    expect(verifyAsset('a1', exp + 1, sig, TEST_SIGNING_KEY)).toBe(false)
    expect(verifyAsset('a1', exp, sig, `${TEST_SIGNING_KEY}x`)).toBe(false)
    expect(verifyAsset('a1', exp, sig, TEST_SIGNING_KEY, (exp + 1) * 1000)).toBe(false)
    for (const bad of ['', 'zz', sig.slice(0, 62), `${sig}00`, sig.toUpperCase(), `${sig.slice(0, 63)}g`]) {
      expect(verifyAsset('a1', exp, bad, TEST_SIGNING_KEY), bad).toBe(false)
    }
    expect(verifyAsset('a1', Number.NaN, sig, TEST_SIGNING_KEY)).toBe(false)
  })

  test('signing and verifying refuse an empty or short key', () => {
    for (const key of ['', 'short']) {
      expect(() => signAsset('a1', exp, key)).toThrow(/at least 32/)
      expect(() => verifyAsset('a1', exp, '0'.repeat(64), key)).toThrow(/at least 32/)
    }
  })
})

describe('assets', () => {
  test('signed url fetches the bytes with the asset mime', async () => {
    const asset = await makeAsset(t.seeded, 'video/mp4')
    const before = Math.floor(Date.now() / 1000)
    const res = await t.app.inject({ method: 'GET', url: `/v1/assets/${asset.id}/url`, headers: bearer(t.seeded.token) })
    const { url, expires_at } = res.json().data
    const u = new URL(url, 'http://x')
    expect(u.pathname).toBe(`/v1/assets/${asset.id}/content`)
    const exp = Number(u.searchParams.get('exp'))
    expect(exp - before).toBeGreaterThanOrEqual(ASSET_URL_TTL_S)
    expect(exp - before).toBeLessThanOrEqual(ASSET_URL_TTL_S + 1)
    expect(expires_at).toBe(new Date(exp * 1000).toISOString())

    const content = await t.app.inject({ method: 'GET', url })
    expect(content.statusCode).toBe(200)
    expect(content.headers['content-type']).toBe('video/mp4')
    expect(content.rawPayload.equals(BYTES)).toBe(true)
  })

  test('Range: bytes=0-99 is 206 with 100 bytes; an unsatisfiable range is 416', async () => {
    const asset = await makeAsset(t.seeded)
    const url = await signedUrl(asset.id)
    const res = await t.app.inject({ method: 'GET', url, headers: { range: 'bytes=0-99' } })
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 0-99/1000')
    expect(res.headers['content-type']).toBe('video/mp4')
    expect(res.rawPayload.equals(BYTES.subarray(0, 100))).toBe(true)

    const tail = await t.app.inject({ method: 'GET', url, headers: { range: 'bytes=900-' } })
    expect(tail.statusCode).toBe(206)
    expect(tail.headers['content-range']).toBe('bytes 900-999/1000')

    const unsatisfiable = await t.app.inject({ method: 'GET', url, headers: { range: 'bytes=5000-6000' } })
    expect(unsatisfiable.statusCode).toBe(416)
    expect(unsatisfiable.headers['content-range']).toBe('bytes */1000')
  })

  test('asset of another workspace is 404; tampered or expired signature is 403', async () => {
    const other = await seedWorkspace(t.db, { workspaceName: 'Other' })
    const theirs = await makeAsset(other)
    const strip = (body: { meta: object }) => ({ ...body, meta: {} })
    const theirRes = await t.app.inject({ method: 'GET', url: `/v1/assets/${theirs.id}/url`, headers: bearer(t.seeded.token) })
    const missingRes = await t.app.inject({ method: 'GET', url: `/v1/assets/${MISSING_ID}/url`, headers: bearer(t.seeded.token) })
    expect(theirRes.statusCode).toBe(404)
    expect(theirRes.json().error.code).toBe('not_found')
    expect(strip(theirRes.json())).toEqual(strip(missingRes.json()))

    const asset = await makeAsset(t.seeded)
    const u = new URL(await signedUrl(asset.id), 'http://x')
    const exp = Number(u.searchParams.get('exp'))
    const sig = u.searchParams.get('sig')!
    const flipped = `${sig.slice(0, 10)}${sig[10] === '0' ? '1' : '0'}${sig.slice(11)}`
    const past = Math.floor(Date.now() / 1000) - 1
    for (const query of [
      `exp=${exp}&sig=${flipped}`,
      `exp=${exp + 1}&sig=${sig}`,
      `exp=${past}&sig=${signAsset(asset.id, past, TEST_SIGNING_KEY)}`,
      `exp=${exp}&sig=nothex`,
      // A valid signature for another asset id does not open this one.
      `exp=${exp}&sig=${signAsset(theirs.id, exp, TEST_SIGNING_KEY)}`,
    ]) {
      const res = await t.app.inject({ method: 'GET', url: `/v1/assets/${asset.id}/content?${query}` })
      expect(res.statusCode, query).toBe(403)
      expect(res.json().error.code).toBe('forbidden')
    }
    // A correctly signed id that does not exist is 404.
    const missing = await t.app.inject({ method: 'GET', url: `/v1/assets/${MISSING_ID}/content?exp=${exp}&sig=${signAsset(MISSING_ID, exp, TEST_SIGNING_KEY)}` })
    expect(missing.statusCode).toBe(404)
    expect((await t.app.inject({ method: 'GET', url: `/v1/assets/${asset.id}/content` })).statusCode).toBe(400)
  })

  test('url route needs auth; content route does not', async () => {
    const asset = await makeAsset(t.seeded)
    const anon = await t.app.inject({ method: 'GET', url: `/v1/assets/${asset.id}/url` })
    expect(anon.statusCode).toBe(401)
    expect(anon.json().error.code).toBe('unauthorized')
    const url = await signedUrl(asset.id)
    expect((await t.app.inject({ method: 'GET', url })).statusCode).toBe(200)
    // A bad credential on the public route is ignored, not rejected.
    expect((await t.app.inject({ method: 'GET', url, headers: { authorization: 'Bearer nope' } })).statusCode).toBe(200)
  })
})
