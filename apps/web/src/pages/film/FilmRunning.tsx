import type { FilmDetail } from '../../api/schemas'
import { StepProgress, stepNumber, workLine } from '../../components/StepProgress'
import { StepDetails } from '../../components/StepTimeline'
import { StudioFloor } from '../../components/studio/StudioFloor'
import { vi } from '../../i18n/vi'
import { FILM_STEPS } from '@stick/core'
import { CancelButton } from './FilmActions'

/** While queued or running: the team at work, one line of who does what, and the steps folded away. */
export function FilmRunning({ detail }: { detail: FilmDetail }) {
  const { film, steps } = detail
  return (
    <div className="film-running">
      <div className="film-running-head">
        <h1>{film.title}</h1>
        <CancelButton filmId={film.id} />
      </div>
      <StudioFloor key={film.id} detail={detail} />
      <div className="film-running-status">
        <p role="status" className="film-work">{workLine(detail)} · {vi.progress(stepNumber(detail), FILM_STEPS.length)}</p>
        <StepProgress detail={detail} />
      </div>
      <StepDetails steps={steps} />
    </div>
  )
}
