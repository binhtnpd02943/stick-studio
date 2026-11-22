import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { Overview } from '../src/pages/Overview'
import '../src/styles/base.css'
import { FakeEventSource, detail, film, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'

const routes = [{ path: '/', element: <Overview /> }, { path: '*', element: <p>đích</p> }]

type Handler = Parameters<typeof mockApi>[0][string]
interface Setup { running?: ReturnType<typeof film>[]; reviewMeta?: Record<string, unknown>; override?: Record<string, Handler> }
const failure = () => json(500, { data: null, error: { code: 'internal', message: 'x', details: {} }, meta: {} })
function api({ running = [], reviewMeta = {}, override = {} }: Setup = {}) {
  return mockApi({
    '/v1/films': (url) => ok(url.searchParams.get('status') === 'running' ? running : []),
    '/v1/review-queue': () => ok(
      [
        { film: { id: 'r1', title: 'Vì sao trời mưa?', status: 'awaiting_review', cost_usd: 0.2, current_version: 1 }, final_asset_id: null, final_url: null, contact_asset_id: null, findings: null },
      ],
      reviewMeta,
    ),
    '/v1/usage': () => ok({ from: '', to: '', total_usd: 2.5, by_day: [], by_provider: [], by_film: [] }),
    '/v1/workspace': () => ok({
      id: 'w', name: 'W', plan: 'p', max_cost_per_film_usd: null, max_cost_per_day_usd: null,
      effective_max_cost_per_film_usd: 1, effective_max_cost_per_day_usd: 10,
    }),
    ...Object.fromEntries(running.map((f) => [
      `/v1/films/${f.id}`,
      () => ok(detail(f, [
        { step: 'story', status: 'succeeded', attempt: 1, error: null, started_at: null, finished_at: null },
        { step: 'screenplay', status: 'running', attempt: 1, error: null, started_at: null, finished_at: null },
      ])),
    ])),
    ...override,
  })
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  stubCanvas()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('overview', () => {
  test("overview shows running films with live steps, the review count and today's cost against the effective cap", async () => {
    api({ running: [film({ id: 'f1', title: 'Phân số là gì?' })] })
    renderRoutes(routes, '/')

    expect(screen.getByRole('heading', { level: 1, name: 'Tổng quan' })).toBeInTheDocument()
    const live = (await screen.findByRole('link', { name: 'Phân số là gì?' })).closest('article')!
    const step = await within(live).findByText('Kịch bản')
    expect(step.closest('li')).toHaveAttribute('data-status', 'running')
    expect(await screen.findByRole('heading', { name: 'Chờ duyệt · 1' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Vì sao trời mưa\?/ })).toHaveAttribute('href', '/films/r1')
    const meter = await screen.findByRole('meter', { name: 'Chi phí hôm nay' })
    expect(meter).toHaveAttribute('aria-valuenow', '2.5')
    expect(meter).toHaveAttribute('aria-valuemax', '10')
    expect(screen.getByRole('link', { name: 'Xem tất cả' })).toHaveAttribute('href', '/films?status=running')
  })

  test('the compact timeline keeps each step status readable by screen readers', async () => {
    api({ running: [film({ id: 'f1', title: 'Phân số là gì?' })] })
    renderRoutes(routes, '/')

    const live = (await screen.findByRole('link', { name: 'Phân số là gì?' })).closest('article')!
    const status = await within(live).findByText('Xong')
    expect(getComputedStyle(status).display).not.toBe('none')
  })

  test('while loading there is no empty state and no zero count', async () => {
    const never = () => new Promise<Response>(() => {})
    api({ override: { '/v1/films': never, '/v1/review-queue': never } })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Đang chạy' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chờ duyệt' })).toBeInTheDocument()
    expect(screen.getAllByText('Đang tải…')).toHaveLength(2)
    expect(screen.queryByText('Chưa có phim nào đang chạy')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có phim nào chờ duyệt')).not.toBeInTheDocument()
  })

  test('a failing films list shows an error, not the empty state or a zero', async () => {
    api({ override: { '/v1/films': failure } })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
    expect(screen.queryByText('Chưa có phim nào đang chạy')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Đang chạy' })).toBeInTheDocument()
  })

  test('a failing review queue shows an error, not the empty state or a zero', async () => {
    api({ override: { '/v1/review-queue': failure } })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
    expect(screen.queryByText('Chưa có phim nào chờ duyệt')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chờ duyệt' })).toBeInTheDocument()
  })

  test('overview opens at most 3 event streams', async () => {
    api({ running: [1, 2, 3, 4, 5].map((n) => film({ id: `f${n}`, title: `Phim ${n}` })) })
    renderRoutes(routes, '/')

    await screen.findByRole('link', { name: 'Phim 3' })
    expect(screen.getByRole('heading', { name: 'Đang chạy · 5' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Phim 4' })).not.toBeInTheDocument()
    expect(FakeEventSource.instances).toHaveLength(3)
  })

  test('review count shows 20+ when there is a next page', async () => {
    api({ reviewMeta: { next_cursor: 'abc' } })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Chờ duyệt · 20+' })).toBeInTheDocument()
  })

  test('with nothing running the empty state says so', async () => {
    api()
    renderRoutes(routes, '/')

    expect(await screen.findByText('Chưa có phim nào đang chạy')).toBeInTheDocument()
  })
})
