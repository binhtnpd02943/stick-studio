import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createQueryClient } from '../src/api/query-client'
import { FilmCard } from '../src/components/FilmCard'
import { Films } from '../src/pages/Films'
import { STICK_STATES } from '../src/stick/timelines'
import { film, json, mockApi, ok, renderRoutes, stubCanvas } from './helpers'

const routes = [{ path: '/films', element: <Films /> }, { path: '/films/:id', element: <p>trang phim</p> }]
const channel = { id: 'c1', platform: 'youtube', display_name: '@hocvui.que', locale: 'vi', review_policy: 'manual', auto_score_threshold: null, created_at: '', updated_at: '' }

beforeEach(stubCanvas)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('films list', () => {
  test('films filter pills set ?status and refetch', async () => {
    const fetchMock = mockApi({ '/v1/films': () => ok([film({ title: 'Phim A', status: 'approved' })]) })
    const { router } = renderRoutes(routes, '/films')
    await screen.findByText('Phim A')
    expect(screen.getByRole('button', { name: 'Tất cả' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: 'Đang làm' }))

    expect(router.state.location.search).toBe('?status=running')
    expect(screen.getByRole('button', { name: 'Đang làm' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('status=running'))).toBe(true))
  })

  test('Xem thêm follows the cursor and appends the next page', async () => {
    const seen: (string | null)[] = []
    mockApi({
      '/v1/films': (url) => {
        const cursor = url.searchParams.get('cursor')
        seen.push(cursor)
        return cursor ? ok([film({ id: 'f2', title: 'Phim hai' })]) : ok([film({ id: 'f1', title: 'Phim một' })], { next_cursor: 'c1' })
      },
    })
    renderRoutes(routes, '/films')
    await screen.findByText('Phim một')

    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }))

    expect(await screen.findByText('Phim hai')).toBeInTheDocument()
    expect(screen.getByText('Phim một')).toBeInTheDocument()
    expect(seen).toEqual([null, 'c1'])
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).not.toBeInTheDocument()
  })
})

describe('film card', () => {
  const renderCard = (f: ReturnType<typeof film>) => renderRoutes([{ path: '/', element: <FilmCard film={f} /> }], '/')

  test('a film card with a timeline_url draws a preview; without one it keeps the card size', async () => {
    const fetchMock = mockApi({ '/t/f1.json': () => json(200, STICK_STATES.done) })
    const { container, unmount } = renderCard(film({ timeline_url: 'https://files.test/t/f1.json?exp=1&sig=a' }))
    expect(container.querySelector('.film-thumb')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('canvas')).toBeInTheDocument())
    const canvas = container.querySelector('canvas')!
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).not.toHaveAttribute('role')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    unmount()

    const bare = renderCard(film({ timeline_url: null }))
    expect(bare.container.querySelector('.film-thumb')).toBeInTheDocument()
    expect(bare.container.querySelector('canvas')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('a new signed url for the same film version does not refetch the timeline', async () => {
    const fetchMock = mockApi({ '/t/f1.json': () => json(200, STICK_STATES.done) })
    const client = createQueryClient(() => {})
    const ui = (f: ReturnType<typeof film>) => (
      <QueryClientProvider client={client}><MemoryRouter><FilmCard film={f} /></MemoryRouter></QueryClientProvider>
    )
    const first = film({ timeline_url: 'https://files.test/t/f1.json?exp=1&sig=a' })
    const { container, rerender } = render(ui(first))
    await waitFor(() => expect(container.querySelector('canvas')).toBeInTheDocument())

    rerender(ui({ ...first, timeline_url: 'https://files.test/t/f1.json?exp=2&sig=b' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('an expired signed url (403) refreshes the lists and draws the preview from the fresh url', async () => {
    mockApi({ '/t/f1.json': (url) => (url.searchParams.get('sig') === 'a' ? json(403, {}) : json(200, STICK_STATES.done)) })
    const client = createQueryClient(() => {})
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const ui = (f: ReturnType<typeof film>) => (
      <QueryClientProvider client={client}><MemoryRouter><FilmCard film={f} /></MemoryRouter></QueryClientProvider>
    )
    const stale = film({ timeline_url: 'https://files.test/t/f1.json?exp=1&sig=a' })
    const { container, rerender } = render(ui(stale))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['films'] }))
    expect(container.querySelector('canvas')).not.toBeInTheDocument()

    rerender(ui({ ...stale, timeline_url: 'https://files.test/t/f1.json?exp=2&sig=b' }))

    await waitFor(() => expect(container.querySelector('canvas')).toBeInTheDocument())
  })
})

describe('new film', () => {
  type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>
  const setup = (post: Handler) => mockApi({
    '/v1/films': (url, init) => (init?.method === 'POST' ? post(url, init) : ok([])),
    '/v1/channels': () => ok([channel]),
  })
  const keyOf = (call: unknown[]) => (call[1] as RequestInit & { headers: Record<string, string> }).headers['idempotency-key']
  const posts = (fetchMock: ReturnType<typeof mockApi>) => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')

  async function openAndFill(title = 'Phân số là gì?') {
    await userEvent.click(await screen.findByRole('button', { name: 'Phim mới' }))
    const input = await screen.findByLabelText('Tiêu đề')
    await waitFor(() => expect(screen.getByLabelText('Kênh')).toHaveValue('c1')) // prefilled: one channel
    fireEvent.change(input, { target: { value: title } })
  }

  test('new film sends one Idempotency-Key per form, reused on retry after a network error', async () => {
    let n = 0
    const fetchMock = setup(() => {
      if (n++ === 0) throw new TypeError('offline')
      return ok(film({ id: 'new1' }))
    })
    renderRoutes(routes, '/films')
    await openAndFill()

    await userEvent.click(screen.getByRole('button', { name: 'Làm phim' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Mất kết nối')
    await userEvent.click(screen.getByRole('button', { name: 'Làm phim' }))

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(2))
    const [first, second] = posts(fetchMock).map(keyOf)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(second).toBe(first)
  })

  test('a successful create navigates to the film', async () => {
    setup(() => ok(film({ id: 'new1' })))
    const { router } = renderRoutes(routes, '/films')
    await openAndFill()

    await userEvent.click(screen.getByRole('button', { name: 'Làm phim' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/films/new1'))
  })

  test('a 400 shows the details list', async () => {
    setup(() => json(400, { data: null, error: { code: 'bad_request', message: 'x', details: [{ path: 'title', message: 'quá ngắn' }] }, meta: {} }))
    renderRoutes(routes, '/films')
    await openAndFill()

    await userEvent.click(screen.getByRole('button', { name: 'Làm phim' }))

    expect(await screen.findByText('title quá ngắn')).toBeInTheDocument()
  })

  test('an 81-character title is blocked client-side with the counter in error', async () => {
    const fetchMock = setup(() => ok(film({ id: 'new1' })))
    renderRoutes(routes, '/films')
    await openAndFill('a'.repeat(81))

    expect(screen.getByText('81/80')).toHaveAttribute('data-error', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Làm phim' }))

    expect(screen.getByLabelText('Tiêu đề')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Tiêu đề tối đa 80 ký tự')).toBeInTheDocument()
    expect(posts(fetchMock)).toHaveLength(0)
  })
})
