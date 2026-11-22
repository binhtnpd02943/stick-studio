import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { applyFilmEvent, useFilmEvents } from '../src/api/events'
import { filmLiveKey, useFilm } from '../src/api/queries'
import type { FilmDetail, FilmEvent } from '../src/api/schemas'

const at = '2026-11-22T10:00:00.000Z'
const detail = (over: Partial<FilmDetail['film']> = {}): FilmDetail => ({
  film: {
    id: 'f1', channel_id: 'c1', topic_id: null, source_type: 'manual', title: 'Phân số', brief: null, status: 'running',
    current_version: 1, cost_usd: 0, qa_score: null, created_by: 'u1', created_at: at, updated_at: at, ...over,
  },
  version: { id: 'v1', version: 1, reason: 'initial', restart_from_step: null, created_at: at },
  steps: [],
  assets: [],
})
const stepEvent = (over: Partial<Extract<FilmEvent, { type: 'step' }>>): FilmEvent =>
  ({ type: 'step', filmId: 'f1', versionId: 'v1', step: 'story', status: 'running', attempt: 1, at, ...over })

describe('applyFilmEvent', () => {
  test('a step event for another version leaves the detail unchanged', () => {
    const d = detail()
    expect(applyFilmEvent(d, stepEvent({ versionId: 'other' }))).toBe(d)
  })

  test('a running then succeeded step event sets started_at and finished_at', () => {
    const later = '2026-11-22T10:00:05.000Z'
    const running = applyFilmEvent(detail(), stepEvent({ step: 'voice' }))
    expect(running.steps).toEqual([{ step: 'voice', status: 'running', attempt: 1, error: null, started_at: at, finished_at: null }])
    const done = applyFilmEvent(running, stepEvent({ step: 'voice', status: 'succeeded', at: later }))
    expect(done.steps[0]).toMatchObject({ status: 'succeeded', started_at: at, finished_at: later })
  })

  test('steps keep the pipeline order whatever order events arrive in', () => {
    let d = applyFilmEvent(detail(), stepEvent({ step: 'render' }))
    d = applyFilmEvent(d, stepEvent({ step: 'story' }))
    expect(d.steps.map((s) => s.step)).toEqual(['story', 'render'])
  })

  test('a film event sets the status', () => {
    const d = detail()
    const next = applyFilmEvent(d, { type: 'film', filmId: 'f1', status: 'awaiting_review', at })
    expect(next.film.status).toBe('awaiting_review')
    expect(d.film.status).toBe('running')
  })
})

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 0
  closed = false
  listeners = new Map<string, (e: MessageEvent) => void>()
  onerror: (() => void) | null = null
  constructor(readonly url: string) { FakeEventSource.instances.push(this) }
  addEventListener(type: string, fn: (e: MessageEvent) => void) { this.listeners.set(type, fn) }
  close() { this.closed = true; this.readyState = 2 }
  emit(type: string, data: unknown) { this.listeners.get(type)!({ data: JSON.stringify(data) } as MessageEvent) }
}

let qc: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
const source = () => FakeEventSource.instances.at(-1)!

beforeEach(() => {
  FakeEventSource.instances = []
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => vi.unstubAllGlobals())

describe('useFilmEvents', () => {
  test('a reconnect snapshot replaces the cached detail', async () => {
    qc.setQueryData(['film', 'f1'], detail({ title: 'cũ' }))
    const { result } = renderHook(() => useFilmEvents('f1'), { wrapper })
    expect(source().url).toBe('/v1/films/f1/events')
    expect(result.current.live).toBe('connecting')
    await act(async () => source().emit('snapshot', detail({ title: 'mới' })))
    expect(qc.getQueryData<FilmDetail>(['film', 'f1'])!.film.title).toBe('mới')
    await waitFor(() => expect(result.current.live).toBe('live'))
  })

  test('a step event updates the cache and a finished step refetches the detail', () => {
    qc.setQueryData(['film', 'f1'], detail())
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    renderHook(() => useFilmEvents('f1'), { wrapper })
    act(() => source().emit('step', stepEvent({})))
    expect(qc.getQueryData<FilmDetail>(['film', 'f1'])!.steps[0]!.status).toBe('running')
    expect(invalidate).not.toHaveBeenCalled()
    act(() => source().emit('step', stepEvent({ status: 'succeeded' })))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['film', 'f1'] })
  })

  test('a film event invalidates detail, versions, films and review-queue', () => {
    qc.setQueryData(['film', 'f1'], detail())
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    renderHook(() => useFilmEvents('f1'), { wrapper })
    act(() => source().emit('film', { type: 'film', filmId: 'f1', status: 'awaiting_review', at }))
    expect(qc.getQueryData<FilmDetail>(['film', 'f1'])!.film.status).toBe('awaiting_review')
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([['film', 'f1'], ['film', 'f1', 'versions'], ['films'], ['review-queue']])
  })

  test('closes the stream on unmount', () => {
    const { unmount } = renderHook(() => useFilmEvents('f1'), { wrapper })
    unmount()
    expect(source().closed).toBe(true)
  })

  test('malformed event data goes offline and closes the stream', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useFilmEvents('f1'), { wrapper })
    await act(async () => source().emit('snapshot', { nope: true }))
    await waitFor(() => expect(result.current.live).toBe('offline'))
    expect(source().closed).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  test('a closed stream falls back to 5 s polling while the film is live', async () => {
    const poll = async (status: FilmDetail['film']['status']) => {
      qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      qc.setQueryData(['film', 'f1'], detail({ status }))
      const { result } = renderHook(() => ({ events: useFilmEvents('f1'), film: useFilm('f1') }), { wrapper })
      await act(async () => { source().readyState = 2; source().onerror!() })
      await waitFor(() => expect(result.current.events.live).toBe('offline'))
      expect(qc.getQueryData(filmLiveKey('f1'))).toBe('offline')
      const query = qc.getQueryCache().find({ queryKey: ['film', 'f1'] })!
      const { refetchInterval } = query.observers[0]!.options
      return typeof refetchInterval === 'function' ? refetchInterval(query) : refetchInterval
    }
    expect(await poll('running')).toBe(5000)
    expect(await poll('awaiting_review')).toBe(false)
  })
})
