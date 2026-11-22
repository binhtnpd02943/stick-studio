import { FILM_STEPS } from '@stick/core'
import type { FilmDetail } from '../api/schemas'
import { vi } from '../i18n/vi'
import { deriveFloor } from './studio/floor-state'
import { memberOf } from './studio/team'

const DONE = ['succeeded', 'skipped']

/** The step a film is on, 1-based: the running one, else the first not yet done. */
export function stepNumber({ steps }: Pick<FilmDetail, 'steps'>): number {
  const done = FILM_STEPS.filter((s) => steps.some((r) => r.step === s && DONE.includes(r.status))).length
  return Math.min(done + 1, FILM_STEPS.length)
}

/** Who is working, in the studio team's words: "Tùng đang viết kịch bản". */
export function workLine(detail: FilmDetail): string {
  const who = deriveFloor(detail).working ?? 'intake'
  return `${memberOf(who).name} ${vi.studio.team[who].doing}`
}

/** One segment per pipeline step: done in ink, the current one in accent. */
export function StepProgress({ detail }: { detail: Pick<FilmDetail, 'steps'> }) {
  const k = stepNumber(detail)
  const label = vi.progress(k, FILM_STEPS.length)
  return (
    <div className="step-progress" role="img" aria-label={label}>
      {FILM_STEPS.map((step, i) => {
        const done = detail.steps.some((r) => r.step === step && DONE.includes(r.status))
        return <i key={step} className={done ? 'done' : i === k - 1 ? 'now' : undefined} />
      })}
    </div>
  )
}
