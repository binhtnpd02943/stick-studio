import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getCsrfToken, setCsrfToken } from '../src/api/client'
import { useFilms } from '../src/api/queries'
import { createQueryClient, redirectToLogin } from '../src/api/query-client'
import { Layout } from '../src/components/Layout'
import { RequireAuth } from '../src/components/RequireAuth'

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const ok = (data: unknown) => respond(200, { data, error: null, meta: {} })
const failure = (status: number, code: string) => respond(status, { data: null, error: { code, message: code, details: {} }, meta: {} })
const ME = { user: { id: 'u', email: 'e@x.vn', name: 'N' }, workspace: { id: 'w', name: 'W', role: 'owner' }, csrf_token: 'tok-1' }

let routes: Record<string, () => Response>
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  routes = {}
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? 'GET'} ${url.split('?')[0]}`]
    return handler ? handler() : failure(404, 'not_found')
  })
  vi.stubGlobal('fetch', fetchMock)
  setCsrfToken(null)
})
afterEach(() => vi.unstubAllGlobals())

function mount(path: string, element: React.ReactNode = <p>privát</p>) {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>trang đăng nhập</p> },
      { element: <RequireAuth><Layout /></RequireAuth>, children: [{ path: '*', element }] },
    ],
    { initialEntries: [path] },
  )
  const client = createQueryClient(() => redirectToLogin(router))
  const view = render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>)
  return { router, client, view }
}

const here = (r: { state: { location: { pathname: string; search: string } } }) => r.state.location.pathname + r.state.location.search

function Films() {
  useFilms({})
  return <p>danh sách</p>
}

describe('RequireAuth', () => {
  test('shows a busy line, then the children and the csrf token once /me succeeds', async () => {
    routes['GET /v1/me'] = () => ok(ME)
    mount('/films')
    expect(screen.getByText('Đang tải…')).toHaveAttribute('aria-busy', 'true')
    expect(await screen.findByText('privát')).toBeInTheDocument()
    expect(getCsrfToken()).toBe('tok-1')
  })

  test('a failed background refetch of /me keeps the children mounted', async () => {
    routes['GET /v1/me'] = () => ok(ME)
    const { client } = mount('/films')
    expect(await screen.findByText('privát')).toBeInTheDocument()
    routes['GET /v1/me'] = () => failure(500, 'internal')
    await client.invalidateQueries({ queryKey: ['me'] })
    await waitFor(() => expect(client.getQueryState(['me'])?.status).toBe('error'))
    expect(screen.getByText('privát')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('a 401 from /me redirects to /login with next', async () => {
    routes['GET /v1/me'] = () => failure(401, 'unauthorized')
    const { router } = mount('/films?status=failed')
    await waitFor(() => expect(here(router)).toBe('/login?next=%2Ffilms%3Fstatus%3Dfailed'))
  })

  test('any other /me failure shows an alert instead of redirecting', async () => {
    routes['GET /v1/me'] = () => failure(500, 'internal')
    const { router } = mount('/films')
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ gặp lỗi')
    expect(here(router)).toBe('/films')
  })

  test('a 401 from any query redirects to /login with next', async () => {
    routes['GET /v1/me'] = () => ok(ME)
    routes['GET /v1/films'] = () => failure(401, 'unauthorized')
    const { router } = mount('/films', <Films />)
    await waitFor(() => expect(here(router)).toBe('/login?next=%2Ffilms'))
  })

  test('logout posts, clears the csrf token and the cache, then goes to /login', async () => {
    routes['GET /v1/me'] = () => ok(ME)
    routes['POST /v1/auth/logout'] = () => ok(null)
    const { router, client } = mount('/films')
    await userEvent.click(await screen.findByRole('button', { name: 'Đăng xuất' }))
    await waitFor(() => expect(here(router)).toBe('/login'))
    expect(getCsrfToken()).toBeNull()
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')!
    expect((post[1] as { headers: Record<string, string> }).headers['x-csrf-token']).toBe('tok-1')
  })
})
