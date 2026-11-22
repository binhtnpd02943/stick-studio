import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { RouteObject } from 'react-router'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { createQueryClient } from '../src/api/query-client'
import type { FilmDetail, FilmListItem } from '../src/api/schemas'

export const at = '2026-11-22T10:00:00.000Z'

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
export const ok = (data: unknown, meta: Record<string, unknown> = {}) => json(200, { data, error: null, meta })

export const film = (over: Partial<FilmListItem> = {}): FilmListItem => ({
  id: 'f1', channel_id: 'c1', topic_id: null, source_type: 'manual', title: 'Phân số là gì?', brief: null, status: 'running',
  current_version: 1, cost_usd: 0.21, qa_score: null, created_by: 'u1', created_at: at, updated_at: at, timeline_url: null, final_url: null, ...over,
})

export const detail = (f: FilmListItem, steps: FilmDetail['steps'] = []): FilmDetail => ({
  film: f,
  version: { id: `${f.id}-v1`, version: 1, reason: 'initial', restart_from_step: null, created_at: at },
  steps,
  assets: [],
})

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>

/** Stubs `fetch`; routes are matched on the pathname, so a signed url on another host works too. */
export function mockApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const handler = routes[url.pathname]
    if (!handler) throw new Error(`unrouted request: ${url.pathname}`)
    return handler(url, init)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function renderRoutes(routes: RouteObject[], path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const ui = (
    <QueryClientProvider client={createQueryClient(() => {})}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return { router, ...render(ui) }
}

/** jsdom has no canvas: a recorder context lets ScenePreview mount without noise. */
export function stubCanvas() {
  const recorder = new Proxy({}, { get: () => () => {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorder as unknown as CanvasRenderingContext2D)
}

export class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 0
  onerror: (() => void) | null = null
  constructor(readonly url: string) { FakeEventSource.instances.push(this) }
  listeners = new Map<string, (e: MessageEvent) => void>()
  addEventListener(type: string, fn: (e: MessageEvent) => void) { this.listeners.set(type, fn) }
  emit(type: string, data: unknown) { this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent) }
  close() { this.readyState = 2 }
}
