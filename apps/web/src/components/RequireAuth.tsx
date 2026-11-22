import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { ApiError } from '../api/client'
import { useMe } from '../api/queries'
import { vi } from '../i18n/vi'
import { ErrorNotice } from './ErrorNotice'

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe()
  const { pathname, search } = useLocation()
  if (me.isSuccess) return children
  if (me.error instanceof ApiError && me.error.status === 401) {
    return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />
  }
  if (me.isError) return <ErrorNotice error={me.error} />
  // Task 8 swaps in <StickState kind="rendering">.
  return <p aria-busy="true">{vi.loading}</p>
}
