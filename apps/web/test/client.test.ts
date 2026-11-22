import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { z } from 'zod/v4'
import { ApiError, apiFetch, getCsrfToken, setCsrfToken } from '../src/api/client'

const envelope = (data: unknown, meta: Record<string, unknown> = {}) => ({ data, error: null, meta: { request_id: 'r1', ...meta } })
const failure = (code: string, details: unknown = {}) => ({ data: null, error: { code, message: code, details }, meta: { request_id: 'r1' } })
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setCsrfToken(null)
})
afterEach(() => vi.unstubAllGlobals())

const Thing = z.object({ n: z.number() })
const lastInit = (call = 0) => fetchMock.mock.calls[call]![1] as RequestInit & { headers: Record<string, string> }

describe('apiFetch', () => {
  test('apiFetch parses data and returns meta', async () => {
    fetchMock.mockResolvedValue(respond(200, envelope({ n: 1 }, { next_cursor: 'c' })))
    const out = await apiFetch('/v1/thing', Thing)
    expect(out.data).toEqual({ n: 1 })
    expect(out.meta).toMatchObject({ next_cursor: 'c' })
    expect(lastInit().credentials).toBe('same-origin')
  })

  test('an error envelope throws ApiError with status, code and details', async () => {
    fetchMock.mockResolvedValue(respond(429, failure('rate_limited', { retry_after_s: 7 })))
    const err = await apiFetch('/v1/thing', Thing).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', details: { retry_after_s: 7 } })
  })

  test('a body that does not match the schema throws code parse', async () => {
    fetchMock.mockResolvedValue(respond(200, envelope({ n: 'x' })))
    await expect(apiFetch('/v1/thing', Thing)).rejects.toMatchObject({ code: 'parse' })
  })

  test('a fetch rejection throws code network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(apiFetch('/v1/thing', Thing)).rejects.toMatchObject({ code: 'network' })
  })

  test('writes send x-csrf-token and json content-type; GETs send neither', async () => {
    setCsrfToken('tok')
    fetchMock.mockImplementation(async () => respond(200, envelope({ n: 1 })))
    await apiFetch('/v1/thing', Thing)
    await apiFetch('/v1/thing', Thing, { method: 'POST', body: { a: 1 } })
    expect(lastInit(0).headers).not.toHaveProperty('x-csrf-token')
    expect(lastInit(0).headers).not.toHaveProperty('content-type')
    expect(lastInit(1).headers).toMatchObject({ 'x-csrf-token': 'tok', 'content-type': 'application/json' })
    expect(lastInit(1).body).toBe('{"a":1}')
  })

  test('a csrf_failed write refetches /me and retries once', async () => {
    setCsrfToken('a')
    const me = { user: { id: 'u', email: 'e@x.vn', name: 'N' }, workspace: { id: 'w', name: 'W', role: 'owner' }, csrf_token: 'b' }
    fetchMock
      .mockResolvedValueOnce(respond(403, failure('csrf_failed')))
      .mockResolvedValueOnce(respond(200, envelope(me)))
      .mockResolvedValueOnce(respond(200, envelope({ n: 2 })))
    const out = await apiFetch('/v1/thing', Thing, { method: 'POST' })
    expect(out.data).toEqual({ n: 2 })
    expect(fetchMock.mock.calls[1]![0]).toBe('/v1/me')
    expect(lastInit(2).headers['x-csrf-token']).toBe('b')
    expect(getCsrfToken()).toBe('b')
  })

  test('a second csrf_failed is thrown, not retried again', async () => {
    const me = { user: { id: 'u', email: 'e@x.vn', name: 'N' }, workspace: { id: 'w', name: 'W', role: 'owner' }, csrf_token: 'b' }
    fetchMock
      .mockResolvedValueOnce(respond(403, failure('csrf_failed')))
      .mockResolvedValueOnce(respond(200, envelope(me)))
      .mockResolvedValueOnce(respond(403, failure('csrf_failed')))
    await expect(apiFetch('/v1/thing', Thing, { method: 'POST' })).rejects.toMatchObject({ code: 'csrf_failed' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
