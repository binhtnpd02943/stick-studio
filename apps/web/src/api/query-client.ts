import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import type { DataRouter } from 'react-router'
import { ApiError } from './client'

const MAX_NETWORK_RETRIES = 2
const DEFAULT_STALE_MS = 30_000

/** Mutation `meta` flag: this mutation's own 401 is an answer (wrong password), not an expired session. */
export const OWNS_UNAUTHORIZED = { ownsUnauthorized: true } as const

export function createQueryClient(onUnauthorized: () => void): QueryClient {
  const handle = (error: unknown, ignore = false): void => {
    if (!ignore && error instanceof ApiError && error.status === 401) onUnauthorized()
  }
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error) => handle(error) }),
    mutationCache: new MutationCache({ onError: (error, _vars, _result, mutation) => handle(error, mutation.meta?.ownsUnauthorized === true) }),
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_MS,
        retry: (count, error) => error instanceof ApiError && error.code === 'network' && count < MAX_NETWORK_RETRIES,
      },
    },
  })
}

/** The global 401 handler: back to /login, remembering where the user was. Does nothing on /login itself. */
export function redirectToLogin(router: Pick<DataRouter, 'state' | 'navigate'>): void {
  const { pathname, search } = router.state.location
  if (pathname === '/login') return
  void router.navigate(`/login?next=${encodeURIComponent(pathname + search)}`, { replace: true })
}
