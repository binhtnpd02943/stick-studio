import { z } from 'zod/v4'
import { Me } from './schemas'

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: unknown = {}) {
    super(message)
    this.name = 'ApiError'
  }
}

// Module memory only: a script-readable store would hand the token to any injected script.
let csrfToken: string | null = null
export const setCsrfToken = (t: string | null): void => { csrfToken = t }
export const getCsrfToken = (): string | null => csrfToken

export interface ApiInit { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string> }
export interface ApiResult<T> { data: T; meta: Record<string, unknown> }

const Envelope = z.object({
  data: z.unknown(),
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown() }).nullable(),
  meta: z.record(z.string(), z.unknown()).default({}),
})

async function send(path: string, init: ApiInit): Promise<Response> {
  const method = init.method ?? 'GET'
  const headers: Record<string, string> = { ...init.headers }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['x-csrf-token'] = csrfToken
  try {
    return await fetch(path, {
      method, headers, credentials: 'same-origin', body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    throw new ApiError(0, 'network', 'network error')
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init: ApiInit, retriedCsrf: boolean): Promise<ApiResult<T>> {
  const res = await send(path, init)
  const envelope = Envelope.safeParse(await res.json().catch(() => null))
  if (!envelope.success) {
    // A proxy's 502 page is a server problem; anything else that is not an envelope is a contract problem.
    throw new ApiError(res.status, res.status >= 500 ? 'internal' : 'parse', 'response is not an api envelope')
  }
  const { data, error, meta } = envelope.data
  if (error) {
    if (error.code === 'csrf_failed' && !retriedCsrf) {
      // The session's token changed (or the page predates it): fetch the current one and retry the write once.
      const me = await request('/v1/me', Me, {}, true)
      setCsrfToken(me.data.csrf_token ?? null)
      return request(path, schema, init, true)
    }
    throw new ApiError(res.status, error.code, error.message, error.details)
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new ApiError(res.status, 'parse', 'response does not match the expected shape', parsed.error.issues)
  return { data: parsed.data, meta }
}

export const apiFetch = <T>(path: string, schema: z.ZodType<T>, init: ApiInit = {}): Promise<ApiResult<T>> =>
  request(path, schema, init, false)
