import type { FilmStatus } from '../api/schemas'
import { vi } from '../i18n/vi'

export function StatusPill({ status }: { status: FilmStatus }) {
  return (
    <span className="status-pill" data-status={status}>
      {status === 'running' && <span className="status-dot" aria-hidden="true" />}
      {vi.status[status]}
    </span>
  )
}
