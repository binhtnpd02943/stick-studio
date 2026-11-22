import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getCsrfToken, setCsrfToken } from '../src/api/client'
import { createQueryClient } from '../src/api/query-client'
import { Login } from '../src/pages/Login'

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const failure = (code: string, details: unknown = {}) => ({ data: null, error: { code, message: code, details }, meta: {} })

let fetchMock: ReturnType<typeof vi.fn>
let onUnauthorized: ReturnType<typeof vi.fn<() => void>>
beforeEach(() => {
  fetchMock = vi.fn()
  onUnauthorized = vi.fn<() => void>()
  vi.stubGlobal('fetch', fetchMock)
  setCsrfToken(null)
})
afterEach(() => vi.unstubAllGlobals())

async function submit(next = '/films', encode = true) {
  const router = createMemoryRouter(
    [{ path: '/login', element: <Login /> }, { path: '*', element: <p>đích</p> }],
    { initialEntries: [`/login?next=${encode ? encodeURIComponent(next) : next}`] },
  )
  render(<QueryClientProvider client={createQueryClient(onUnauthorized)}><RouterProvider router={router} /></QueryClientProvider>)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), 'ban@vidu.vn')
  await user.type(screen.getByLabelText('Mật khẩu'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))
  return router
}

describe('login', () => {
  test('the form has an email and a password field with the right autocomplete', () => {
    const router = createMemoryRouter([{ path: '/login', element: <Login /> }], { initialEntries: ['/login'] })
    render(<QueryClientProvider client={createQueryClient(onUnauthorized)}><RouterProvider router={router} /></QueryClientProvider>)
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Mật khẩu')).toHaveAttribute('autocomplete', 'current-password')
  })

  test('wrong credentials show Sai email hoặc mật khẩu and do not redirect', async () => {
    fetchMock.mockResolvedValue(respond(401, failure('unauthorized')))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Sai email hoặc mật khẩu')
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  test('429 shows the retry seconds', async () => {
    fetchMock.mockResolvedValue(respond(429, failure('rate_limited', { retry_after_s: 42 })))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('thử lại sau 42 giây')
  })

  test('500 shows Đăng nhập tạm thời không dùng được', async () => {
    fetchMock.mockResolvedValue(respond(500, failure('internal')))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Đăng nhập tạm thời không dùng được')
  })

  test('success stores the csrf token and navigates to next', async () => {
    fetchMock.mockResolvedValue(respond(200, { data: { csrf_token: 'tok' }, error: null, meta: {} }))
    const router = await submit('/films?status=failed')
    await waitFor(() => expect(router.state.location.pathname).toBe('/films'))
    expect(router.state.location.search).toBe('?status=failed')
    expect(getCsrfToken()).toBe('tok')
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ email: 'ban@vidu.vn', password: 'secret' })
  })

  test.each(['/%09/evil.example', '/%0a/evil.example'])('a raw query next of %s (control char once decoded) navigates to /', async (next) => {
    fetchMock.mockResolvedValue(respond(200, { data: { csrf_token: 'tok' }, error: null, meta: {} }))
    const router = await submit(next, false)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  test.each(['//evil.example', 'https://evil.example', '/\\evil.example', '/\t/evil.example'])('a next of %s navigates to /', async (next) => {
    fetchMock.mockResolvedValue(respond(200, { data: { csrf_token: 'tok' }, error: null, meta: {} }))
    const router = await submit(next)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
