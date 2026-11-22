import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Layout } from '../src/components/Layout'
import { mockApi, ok, renderRoutes } from './helpers'

const routes = [{ element: <Layout />, children: [{ path: '*', element: <p>nội dung</p> }] }]

function api() {
  mockApi({
    '/v1/me': () => ok({ user: { id: 'u', email: 'a@b.c', name: 'An' }, workspace: { id: 'w', name: 'W', role: 'owner' } }),
    '/v1/usage': () => ok({ from: '', to: '', total_usd: 1.2, by_day: [], by_provider: [], by_film: [] }),
    '/v1/workspace': () => ok({
      id: 'w', name: 'W', plan: 'p', max_cost_per_film_usd: null, max_cost_per_day_usd: null,
      effective_max_cost_per_film_usd: 1, effective_max_cost_per_day_usd: 10,
    }),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('layout', () => {
  test('the nav has four items, no Duyệt, and marks the current one with the brand in words', async () => {
    api()
    renderRoutes(routes, '/films')
    const labels = ['Tổng quan', 'Phim', 'Nhân vật', 'Cài đặt']
    const nav = screen.getByRole('navigation', { name: 'Chính' })
    expect([...nav.querySelectorAll('a')].map((a) => a.textContent)).toEqual(labels)
    expect(screen.queryByRole('link', { name: 'Duyệt' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Phim' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Tổng quan' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Stick Studio' })).toHaveAttribute('href', '/')
  })

  test("the header shows today's spend against the effective daily cap", async () => {
    api()
    renderRoutes(routes, '/')
    const meter = await screen.findByRole('meter', { name: 'Chi phí hôm nay' })
    expect(meter).toHaveAttribute('aria-valuenow', '1.2')
    expect(meter).toHaveAttribute('aria-valuemax', '10')
    expect(screen.getByText('Hôm nay')).toBeInTheDocument()
    expect(screen.getByText('$1.20 / $10.00')).toBeInTheDocument()
  })

  test('the avatar opens a menu with Đăng xuất, and Escape closes it', async () => {
    api()
    renderRoutes(routes, '/')
    const avatar = screen.getByRole('button', { name: 'Tài khoản' })
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument()
    await userEvent.click(avatar)
    expect(avatar).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument()
  })
})
