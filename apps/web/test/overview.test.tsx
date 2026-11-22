import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { FilmListItem } from '../src/api/schemas'
import { Overview } from '../src/pages/Overview'
import '../src/styles/base.css'
import { STICK_STATES } from '../src/stick/timelines'
import { FakeEventSource, at, detail, film, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'

const routes = [{ path: '/', element: <Overview /> }, { path: '*', element: <p>đích</p> }]
const channel = { id: 'c1', platform: 'tiktok', display_name: 'Kênh', locale: 'vi-VN', review_policy: 'manual', auto_score_threshold: null, created_at: at, updated_at: at }

type Handler = Parameters<typeof mockApi>[0][string]
interface Setup { running?: FilmListItem[]; recent?: FilmListItem[]; override?: Record<string, Handler> }
const failure = () => json(500, { data: null, error: { code: 'internal', message: 'x', details: {} }, meta: {} })
function api({ running = [], recent = [], override = {} }: Setup = {}) {
  return mockApi({
    '/v1/films': (url, init) => {
      if (init?.method === 'POST') return ok(film({ id: 'new1', status: 'queued' }))
      const status = url.searchParams.get('status')
      return ok(status === 'running' ? running : status ? [] : recent)
    },
    '/v1/channels': () => ok([channel]),
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
const done = (n: number, over: Partial<FilmListItem> = {}) =>
  film({ id: `d${n}`, title: `Phim xong ${n}`, status: 'awaiting_review', updated_at: new Date(Date.parse(at) + n * 60_000).toISOString(), ...over })

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  stubCanvas()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('overview: compose', () => {
  test('a topic creates the film with that title on the first channel, with an Idempotency-Key, and opens it', async () => {
    const fetchMock = api()
    const { router } = renderRoutes(routes, '/')
    expect(screen.getByRole('heading', { level: 1, name: 'Hôm nay làm phim gì?' })).toBeInTheDocument()
    const make = screen.getByRole('button', { name: 'Làm phim' })
    await waitFor(() => expect(make).toBeEnabled())
    await userEvent.type(screen.getByRole('textbox', { name: 'Chủ đề phim' }), '  Vì sao biển mặn?  ')
    await userEvent.click(make)

    await waitFor(() => expect(router.state.location.pathname).toBe('/films/new1'))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(String(post[1]!.body))).toEqual({ channel_id: 'c1', title: 'Vì sao biển mặn?' })
    expect((post[1] as { headers: Record<string, string> }).headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  })

  test('an empty topic says so and sends nothing; a retry of the same topic reuses its key, a new topic gets a new one', async () => {
    let fail = true
    const fetchMock = api({ override: { '/v1/films': (_u, init) => (init?.method === 'POST' ? (fail ? failure() : ok(film({ id: 'n2' }))) : ok([])) } })
    renderRoutes(routes, '/')
    const make = screen.getByRole('button', { name: 'Làm phim' })
    await waitFor(() => expect(make).toBeEnabled())
    await userEvent.click(make)
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy nhập chủ đề phim')
    expect(screen.getByRole('textbox', { name: 'Chủ đề phim' })).toHaveAttribute('aria-invalid', 'true')

    const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => (init as { headers: Record<string, string> }).headers['idempotency-key'])
    const input = screen.getByRole('textbox', { name: 'Chủ đề phim' })
    await userEvent.type(input, 'Cầu vồng')
    await userEvent.click(make)
    await screen.findByText('Máy chủ gặp lỗi')
    await userEvent.click(make)
    await waitFor(() => expect(posts()).toHaveLength(2))
    await userEvent.type(input, ' có mấy màu?')
    fail = false
    await userEvent.click(make)
    await waitFor(() => expect(posts()).toHaveLength(3))
    const [a, b, c] = posts()
    expect(a).toBe(b)
    expect(c).not.toBe(a)
  })

  test('the hint gives the time, and the average cost once finished films have one', async () => {
    api({ recent: [done(1, { cost_usd: 0.3 }), done(2, { cost_usd: 0.5 })] })
    renderRoutes(routes, '/')
    expect(await screen.findByText(/khoảng 3–5 phút và khoảng ~\$0\.40/)).toBeInTheDocument()
  })
})

describe('overview: running', () => {
  test('a running film is one row: who works on it, the step it is on, and a quiet link to the film', async () => {
    api({ running: [film({ id: 'f1', title: 'Phân số là gì?' })] })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Đang làm · 1' })).toBeInTheDocument()
    const row = (await screen.findByRole('link', { name: 'Phân số là gì?' })).closest('article')!
    expect(await within(row).findByText('Tùng đang viết kịch bản')).toBeInTheDocument()
    expect(within(row).getByRole('img', { name: 'Bước 2 trên 8' })).toBeInTheDocument()
    expect(row.querySelectorAll('.step-progress i.done')).toHaveLength(1)
    expect(row.querySelectorAll('.step-progress i.now')).toHaveLength(1)
    expect(within(row).getByRole('link', { name: 'Xem đội làm việc' })).toHaveAttribute('href', '/films/f1')
    expect(document.querySelector('.studio-scene')).toBeNull()
  })

  test('at most 3 rows and 3 event streams, while the count says all of them', async () => {
    api({ running: [1, 2, 3, 4, 5].map((n) => film({ id: `f${n}`, title: `Phim ${n}` })) })
    renderRoutes(routes, '/')

    await screen.findByRole('link', { name: 'Phim 3' })
    expect(screen.getByRole('heading', { name: 'Đang làm · 5' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Phim 4' })).not.toBeInTheDocument()
    expect(FakeEventSource.instances).toHaveLength(3)
  })

  test('with nothing running there is one muted line, no illustration', async () => {
    api()
    renderRoutes(routes, '/')
    expect(await screen.findByText('Không có phim nào đang làm.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Đang làm · 0' })).toBeInTheDocument()
    expect(document.querySelector('.stick-state')).toBeNull()
  })

  test('while loading there is no empty line and no zero count; a failing list shows an error', async () => {
    const never = () => new Promise<Response>(() => {})
    api({ override: { '/v1/films': never } })
    const first = renderRoutes(routes, '/')
    expect(await screen.findByRole('heading', { name: 'Đang làm' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Vừa xong' })).toBeInTheDocument()
    expect(screen.queryByText('Không có phim nào đang làm.')).not.toBeInTheDocument()
    first.unmount()

    api({ override: { '/v1/films': failure } })
    renderRoutes(routes, '/')
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Máy chủ gặp lỗi')
    expect(screen.queryByText('Không có phim nào đang làm.')).not.toBeInTheDocument()
  })
})

describe('overview: finished', () => {
  test('only finished films, newest first, at most 8, with a link to all films and no review or cost section', async () => {
    const recent = [
      ...Array.from({ length: 9 }, (_, i) => done(i + 1)),
      film({ id: 'x1', title: 'Đang chạy dở', status: 'running' }),
      film({ id: 'x2', title: 'Bị lỗi', status: 'failed' }),
      done(20, { title: 'Đã đăng', status: 'published' }),
      done(21, { title: 'Trượt', status: 'qa_failed' }),
      done(22, { title: 'Đã duyệt', status: 'approved' }),
    ]
    api({ recent })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: 'Vừa xong · 8' })).toBeInTheDocument()
    const titles = [...document.querySelectorAll('.finished-title')].map((a) => a.textContent)
    expect(titles).toEqual(['Đã duyệt', 'Trượt', 'Đã đăng', 'Phim xong 9', 'Phim xong 8', 'Phim xong 7', 'Phim xong 6', 'Phim xong 5'])
    expect(screen.getByRole('link', { name: 'Tất cả phim' })).toHaveAttribute('href', '/films')
    expect(screen.queryByText(/Chờ duyệt/)).not.toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
  })

  test('a card downloads the final video, cannot publish yet, and its menu leads to the redo box', async () => {
    api({ recent: [done(1, { final_url: '/v1/assets/a1/content?exp=1&sig=s', cost_usd: 0.38 })] })
    renderRoutes(routes, '/')
    const card = (await screen.findByRole('link', { name: 'Phim xong 1' })).closest('article')!

    const download = within(card).getByRole('link', { name: 'Tải về' })
    expect(download).toHaveAttribute('href', '/v1/assets/a1/content?exp=1&sig=s')
    expect(download).toHaveAttribute('download')
    expect(within(card).getByRole('button', { name: 'Đăng' })).toBeDisabled()
    expect(card).toHaveTextContent('$0.38 ·')

    const more = within(card).getByRole('button', { name: 'Thêm' })
    await userEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(card).getByRole('link', { name: 'Làm lại' })).toHaveAttribute('href', '/films/d1#redo')
    await userEvent.keyboard('{Escape}')
    expect(within(card).queryByRole('link', { name: 'Làm lại' })).not.toBeInTheDocument()
  })

  test('a qa_failed card is flagged and its first action opens the quality tab', async () => {
    api({ recent: [done(1, { status: 'qa_failed', final_url: '/v1/assets/a1/content' })] })
    renderRoutes(routes, '/')
    const card = (await screen.findByRole('link', { name: 'Phim xong 1' })).closest('article')!
    expect(within(card).getByText('Cần xem lại')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Xem lỗi' })).toHaveAttribute('href', '/films/d1?tab=qa')
    expect(within(card).queryByRole('link', { name: 'Tải về' })).not.toBeInTheDocument()
  })

  test('the thumbnail draws the opening scene from timeline_url and shows the length', async () => {
    api({
      recent: [done(1, { timeline_url: 'https://files.test/t/d1.json?exp=1&sig=a' })],
      override: { '/t/d1.json': () => json(200, STICK_STATES.done) },
    })
    renderRoutes(routes, '/')
    const card = (await screen.findByRole('link', { name: 'Phim xong 1' })).closest('article')!
    await waitFor(() => expect(card.querySelector('.film-thumb canvas')).toBeInTheDocument())
    expect(within(card).getByText('0:02')).toBeInTheDocument()
  })

  test('with nothing finished there is one muted line', async () => {
    api()
    renderRoutes(routes, '/')
    expect(await screen.findByText('Chưa có phim nào xong.')).toBeInTheDocument()
  })
})
