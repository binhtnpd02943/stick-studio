import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReviewItem } from '../src/api/schemas'
import { Review } from '../src/pages/Review'
import '../src/styles/base.css'
import { detail, film, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'

const routes = [{ path: '/review', element: <Review /> }]
const conflict = () => json(409, { data: null, error: { code: 'conflict', message: 'x', details: {} }, meta: {} })

const item = (id: string, title: string, over: Partial<ReviewItem> = {}): ReviewItem => ({
  film: { id, title, status: 'awaiting_review', cost_usd: 0.2, current_version: 1 },
  final_asset_id: `a-${id}`, final_url: `/v1/assets/a-${id}/content?exp=1&sig=x`, contact_asset_id: null, timeline_url: null, findings: null, ...over,
})
const qaFailed = (id: string, title: string, findings: string[]) =>
  item(id, title, {
    film: { id, title, status: 'qa_failed', cost_usd: 0.2, current_version: 1 },
    final_asset_id: null, final_url: null,
    findings: { code: 'gate', message: 'gate failed', details: { findings } },
  })

interface Setup { queue?: ReviewItem[]; review?: (url: URL, init?: RequestInit) => Response; extra?: Record<string, () => Response> }
/** A queue that drops a film once a decision for it is posted, like the real one. */
function api({ queue = [item('f1', 'Phim một'), item('f2', 'Phim hai')], review, extra = {} }: Setup = {}) {
  let items = queue
  const posts: { path: string; body: unknown }[] = []
  const routesMap: Record<string, (url: URL, init?: RequestInit) => Response> = {
    '/v1/review-queue': () => ok(items),
    ...extra,
  }
  for (const { film: f } of queue) {
    routesMap[`/v1/films/${f.id}/review`] = (url, init) => {
      posts.push({ path: url.pathname, body: JSON.parse(String(init?.body)) })
      const res = review?.(url, init) ?? ok(detail(film({ id: f.id })))
      if (res.ok) items = items.filter((i) => i.film.id !== f.id)
      return res
    }
  }
  const fetchMock = mockApi(routesMap)
  const queueFetches = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/v1/review-queue')).length
  return { posts, queueFetches }
}

beforeEach(stubCanvas)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('review page', () => {
  test('approve posts decision approved and shows the next film', async () => {
    const { posts } = api()
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    expect(screen.getByText('1/2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt' }))

    expect(await screen.findByText('Phim hai')).toBeInTheDocument()
    expect(posts).toEqual([{ path: '/v1/films/f1/review', body: { decision: 'approved' } }])
    expect(screen.getByText('1/1')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Đã duyệt')
  })

  test('Làm lại needs one quick reason and posts the mapped step: Giọng -> voice with reason Giọng: <note>', async () => {
    const { posts } = api()
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')

    await userEvent.click(screen.getByRole('button', { name: 'Làm lại' }))
    const sheet = await screen.findByRole('dialog')
    const send = within(sheet).getByRole('button', { name: 'Gửi' })
    expect(send).toBeDisabled()
    expect(within(sheet).getAllByRole('button', { pressed: false })).toHaveLength(5)

    await userEvent.click(within(sheet).getByRole('button', { name: 'Giọng' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Nhịp' }))
    expect(within(sheet).getAllByRole('button', { pressed: true })).toHaveLength(1) // exactly one
    await userEvent.click(within(sheet).getByRole('button', { name: 'Giọng' }))
    await userEvent.type(within(sheet).getByLabelText('Ghi chú'), 'đọc quá nhanh')
    await userEvent.click(send)

    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.body).toEqual({ decision: 'redo', reason: 'Giọng: đọc quá nhanh', redo_from_step: 'voice' })
    expect(await screen.findByText('Phim hai')).toBeInTheDocument()
  })

  test('without a note the reason is the label alone', async () => {
    const { posts } = api()
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    await userEvent.click(screen.getByRole('button', { name: 'Làm lại' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sai kiến thức' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Gửi' }))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]?.body).toEqual({ decision: 'redo', reason: 'Sai kiến thức', redo_from_step: 'story' })
  })

  test('a qa_failed item shows its findings and Làm lại but not Duyệt', async () => {
    api({ queue: [qaFailed('f1', 'Phim lỗi', ['Minh đứng yên 3,1 giây', 'Cảnh 2 quá dài'])] })
    renderRoutes(routes, '/review')

    expect(await screen.findByText('Trượt QA · 2 cảnh báo')).toBeInTheDocument()
    expect(screen.getByText('Minh đứng yên 3,1 giây')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Làm lại' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(screen.getByText('Đang làm phim…')).toBeInTheDocument() // no final_url yet
  })

  test('a qa_failed item with no findings detail still shows the banner', async () => {
    api({ queue: [{ ...qaFailed('f1', 'Phim lỗi', []), findings: { code: 'gate', message: 'x' } }] })
    renderRoutes(routes, '/review')
    expect(await screen.findByText('Trượt QA · 0 cảnh báo')).toBeInTheDocument()
  })

  test('a 409 on approve refetches the queue and says so', async () => {
    const { queueFetches } = api({ review: conflict })
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    const before = queueFetches()

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt' }))

    expect(await screen.findByText('Phim vừa thay đổi, đã tải lại danh sách')).toBeInTheDocument()
    await waitFor(() => expect(queueFetches()).toBeGreaterThan(before))
    expect(screen.getByText('Phim một')).toBeInTheDocument()
  })

  test('another error shows the error notice and keeps the card', async () => {
    api({ review: () => json(500, { data: null, error: { code: 'internal', message: 'x', details: {} }, meta: {} }) })
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    await userEvent.click(screen.getByRole('button', { name: 'Duyệt' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
    expect(screen.getByText('Phim một')).toBeInTheDocument()
  })

  test('an empty queue shows Hết phim chờ duyệt', async () => {
    api({ queue: [] })
    renderRoutes(routes, '/review')
    expect(await screen.findByText('Hết phim chờ duyệt')).toBeInTheDocument()
  })

  test('a pending queue is loading, not empty', async () => {
    mockApi({ '/v1/review-queue': () => new Promise<Response>(() => {}) })
    renderRoutes(routes, '/review')
    expect(await screen.findByText('Đang tải…')).toBeInTheDocument()
    expect(screen.queryByText('Hết phim chờ duyệt')).not.toBeInTheDocument()
  })

  test('a failed queue with nothing loaded shows the error', async () => {
    mockApi({ '/v1/review-queue': () => json(500, { data: null, error: { code: 'internal', message: 'x', details: {} }, meta: {} }) })
    renderRoutes(routes, '/review')
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
    expect(screen.queryByText('Hết phim chờ duyệt')).not.toBeInTheDocument()
  })

  test('?film= starts at that film', async () => {
    api({ queue: [item('f1', 'Phim một'), item('f2', 'Phim hai'), item('f3', 'Phim ba')] })
    renderRoutes(routes, '/review?film=f2')
    expect(await screen.findByText('Phim hai')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  test('?film= beyond the loaded page is fetched from the film detail and shown first', async () => {
    const f9 = film({ id: 'f9', title: 'Phim chín', status: 'awaiting_review' })
    api({
      extra: {
        '/v1/films/f9': () => ok({ ...detail(f9), assets: [{ id: 'a-f9', kind: 'final', path: null, mime: null, bytes: null }] }),
        '/v1/assets/a-f9/url': () => ok({ url: '/v1/assets/a-f9/content?exp=1&sig=y', expires_at: '2026-11-22T10:15:00.000Z' }),
      },
    })
    const { container } = renderRoutes(routes, '/review?film=f9')

    expect(await screen.findByText('Phim chín')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', '/v1/assets/a-f9/content?exp=1&sig=y'))
  })

  test('Tiếp and Trước move between films without deciding', async () => {
    const { posts } = api()
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    expect(screen.getByRole('button', { name: '‹ Trước' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Tiếp ›' }))
    expect(screen.getByText('Phim hai')).toBeInTheDocument()
    expect(screen.getByText('2/2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '‹ Trước' }))

    expect(screen.getByText('Phim một')).toBeInTheDocument()
    expect(posts).toEqual([])
  })

  test('a swipe on the video moves between films, but not one that starts on the video controls', async () => {
    api()
    const { container } = renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    const drag = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const stage = container.querySelector('.review-stage')! // a new card per film, so look it up each time
      vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect)
      fireEvent.pointerDown(stage, { clientX: from.x, clientY: from.y, pointerId: 1 })
      fireEvent.pointerUp(stage, { clientX: to.x, clientY: to.y, pointerId: 1 })
    }

    drag({ x: 300, y: 790 }, { x: 100, y: 790 }) // on the controls bar
    expect(screen.getByText('Phim một')).toBeInTheDocument()
    drag({ x: 300, y: 300 }, { x: 100, y: 310 })
    expect(screen.getByText('Phim hai')).toBeInTheDocument()
    drag({ x: 100, y: 300 }, { x: 300, y: 300 })
    expect(screen.getByText('Phim một')).toBeInTheDocument()
  })

  test('an expired url refetches the queue, and a failed refetch keeps the card', async () => {
    let calls = 0
    mockApi({
      '/v1/review-queue': () => (++calls === 1 ? ok([item('f1', 'Phim một')]) : json(500, { data: null, error: { code: 'internal', message: 'x', details: {} }, meta: {} })),
    })
    const { container } = renderRoutes(routes, '/review')
    await screen.findByText('Phim một')

    act(() => { fireEvent.error(container.querySelector('video')!) })

    await waitFor(() => expect(calls).toBeGreaterThan(1))
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
    expect(screen.getByText('Phim một')).toBeInTheDocument()
  })

  test('buttons are reachable by Tab in the order video controls, Duyệt, Làm lại', async () => {
    api()
    const { container } = renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    const video = container.querySelector('video')!
    video.tabIndex = 0 // jsdom has no built-in controls; a real <video controls> is a tab stop
    const order: Element[] = []

    for (let i = 0; i < 5; i++) {
      await userEvent.tab()
      order.push(document.activeElement!)
    }

    // DOM order is visual order: nav on top (Trước is disabled on the first film), then the player (its unmute button is a video control), then the bar
    expect(order).toEqual([
      screen.getByRole('button', { name: 'Tiếp ›' }), video, screen.getByRole('button', { name: 'Bật tiếng' }),
      screen.getByRole('button', { name: 'Duyệt' }), screen.getByRole('button', { name: 'Làm lại' }),
    ])
    await userEvent.tab()
    expect(document.body).toHaveFocus() // nothing after the bar
  })

  test('while a decision is in flight, Trước/Tiếp are disabled and a swipe does nothing', async () => {
    let finish: (r: Response) => void = () => {}
    mockApi({
      '/v1/review-queue': () => ok([item('f1', 'Phim một'), item('f2', 'Phim hai')]),
      '/v1/films/f1/review': () => new Promise<Response>((resolve) => { finish = resolve }),
    })
    const { container } = renderRoutes(routes, '/review')
    await screen.findByText('Phim một')

    await userEvent.click(screen.getByRole('button', { name: 'Duyệt' }))

    expect(screen.getByRole('button', { name: 'Tiếp ›' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeDisabled()
    const stage = container.querySelector('.review-stage')!
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect)
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 300, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 100, clientY: 300, pointerId: 1 })
    expect(screen.getByText('Phim một')).toBeInTheDocument()
    await act(async () => { finish(ok(detail(film({ id: 'f1' })))) })
    expect(await screen.findByRole('status')).toHaveTextContent('Đã duyệt') // the callbacks still ran
  })

  test('the Duyệt and Làm lại buttons have accessible names and are at least 48px tall', async () => {
    api()
    renderRoutes(routes, '/review')
    await screen.findByText('Phim một')
    for (const name of ['Duyệt', 'Làm lại']) {
      expect(getComputedStyle(screen.getByRole('button', { name })).minHeight).toBe('48px')
    }
  })
})
