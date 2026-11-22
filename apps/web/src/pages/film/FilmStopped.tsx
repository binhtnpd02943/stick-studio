import { FILM_STEPS } from '@stick/core'
import { useRedoFilm } from '../../api/queries'
import type { FilmDetail } from '../../api/schemas'
import { ErrorNotice } from '../../components/ErrorNotice'
import { StepDetails } from '../../components/StepTimeline'
import { vi } from '../../i18n/vi'
import { retryStep } from './facts'
import { useRefetchOnConflict } from './FilmActions'

function message({ film, steps }: FilmDetail): string {
  if (film.status === 'blocked_budget') return vi.detail.blocked
  if (film.status === 'cancelled') return vi.detail.cancelled
  const failed = steps.find((s) => s.status === 'failed')?.step
  return failed ? vi.detail.failed(vi.steps[failed]) : vi.detail.failedUnknown
}

/** Failed, blocked or cancelled: what happened in user words, and one way forward. */
export function FilmStopped({ detail }: { detail: FilmDetail }) {
  const redo = useRedoFilm()
  const onError = useRefetchOnConflict(detail.film.id)
  const retry = () => redo.mutate({ id: detail.film.id, from_step: retryStep(detail, FILM_STEPS), reason: vi.detail.retryReason }, { onError })
  return (
    <div className="film-stopped">
      <h1>{detail.film.title}</h1>
      <p className="film-stopped-msg">{message(detail)}</p>
      {redo.error && <ErrorNotice error={redo.error} />}
      <div><button type="button" className="primary" disabled={redo.isPending} onClick={retry}>{vi.detail.retry}</button></div>
      <StepDetails steps={detail.steps} />
    </div>
  )
}
