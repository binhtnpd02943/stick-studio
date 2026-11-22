import { render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createQueryClient } from '../src/api/query-client'
import { routes } from '../src/app'
import { StatusPill } from '../src/components/StatusPill'
import { mockApi, ok } from './helpers'

afterEach(() => vi.unstubAllGlobals())

describe('routes', () => {
  test('/review is retired and lands on the overview', async () => {
    mockApi({
      '/v1/me': () => ok({ user: { id: 'u', email: 'a@b.c', name: 'An' }, workspace: { id: 'w', name: 'W', role: 'owner' } }),
      '/v1/films': () => ok([]),
      '/v1/channels': () => ok([]),
      '/v1/usage': () => ok({ from: '', to: '', total_usd: 0, by_day: [], by_provider: [], by_film: [] }),
      '/v1/workspace': () => ok({ id: 'w', name: 'W', plan: 'p', max_cost_per_film_usd: null, max_cost_per_day_usd: null, effective_max_cost_per_film_usd: 1, effective_max_cost_per_day_usd: 10 }),
    })
    const router = createMemoryRouter(routes, { initialEntries: ['/review?film=f1'] })
    render(<QueryClientProvider client={createQueryClient(() => {})}><RouterProvider router={router} /></QueryClientProvider>)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay làm phim gì?' })).toBeInTheDocument()
  })
})

describe('status words', () => {
  test.each([
    ['awaiting_review', 'Xong'],
    ['approved', 'Xong'],
    ['published', 'Đã đăng'],
    ['qa_failed', 'Cần xem lại'],
    ['running', 'Đang làm'],
  ] as const)('%s reads %s', (status, word) => {
    render(<StatusPill status={status} />)
    expect(screen.getByText(word)).toBeInTheDocument()
  })
})
