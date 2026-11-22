import { useVersions } from '../../api/queries'
import type { Film } from '../../api/schemas'
import { ErrorNotice } from '../../components/ErrorNotice'
import { relativeTime } from '../../components/format'
import { vi } from '../../i18n/vi'

const FIRST_REASON = 'initial' // the API's reason for a film's first version

export function VersionsTab({ film }: { film: Film }) {
  const versions = useVersions(film.id)
  if (versions.error) return <ErrorNotice error={versions.error} />
  if (!versions.data) return <p className="muted">{vi.loading}</p>
  const newestFirst = [...versions.data].sort((a, b) => b.version - a.version)
  return (
    <ul className="versions">
      {newestFirst.map((v) => (
        <li key={v.id}>
          <b>{vi.versions.name(v.version)}</b>
          <span>{v.reason === FIRST_REASON ? vi.versions.first : v.reason}</span>
          {v.restart_from_step && <span className="muted">{vi.versions.redoFrom(vi.steps[v.restart_from_step])}</span>}
          <time className="muted" dateTime={v.created_at}>{relativeTime(v.created_at)}</time>
          {v.version === film.current_version && <span className="chip">{vi.versions.current}</span>}
        </li>
      ))}
    </ul>
  )
}
