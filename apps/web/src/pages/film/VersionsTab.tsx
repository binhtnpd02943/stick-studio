import { useVersions } from '../../api/queries'
import type { Film } from '../../api/schemas'
import { ErrorNotice } from '../../components/ErrorNotice'
import { vi } from '../../i18n/vi'

export function VersionsTab({ film }: { film: Film }) {
  const versions = useVersions(film.id)
  if (versions.error) return <ErrorNotice error={versions.error} />
  if (!versions.data) return <p>{vi.loading}</p>
  const newestFirst = [...versions.data].sort((a, b) => b.version - a.version)
  return (
    <ul className="versions">
      {newestFirst.map((v) => (
        <li key={v.id}>
          <b>v{v.version}</b> <span>{v.reason}</span>
          {v.restart_from_step && <span>{vi.versions.redoFrom(vi.steps[v.restart_from_step])}</span>}
          <time dateTime={v.created_at}>{new Date(v.created_at).toLocaleString('vi-VN')}</time>
          {v.version === film.current_version && <span className="version-current">{vi.versions.current}</span>}
        </li>
      ))}
    </ul>
  )
}
