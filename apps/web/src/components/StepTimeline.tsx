import { FILM_STEPS } from '@stick/core'
import type { FilmDetail } from '../api/schemas'
import { vi } from '../i18n/vi'
import { formatUsd } from './CostBadge'

type Run = FilmDetail['steps'][number]
interface StepError { code?: string; message?: string; details?: { scope?: string; spentUsd?: number; capUsd?: number; findings?: unknown[] } }

const MARKERS = { none: '', running: '', succeeded: '✓', failed: '!', skipped: '–' } as const

const seconds = (run: Run) =>
  run.started_at && run.finished_at ? ((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000).toFixed(1) + 's' : null

function errorLines(raw: unknown): string[] {
  const { code, message, details } = (raw ?? {}) as StepError
  if (code === 'budget' && details) return [vi.film.budgetHit(details.scope ?? 'day', formatUsd(details.spentUsd ?? 0), formatUsd(details.capUsd ?? 0))]
  const findings = details?.findings
  return [message, Array.isArray(findings) ? vi.film.qaFindings(findings.length) : undefined].filter((l): l is string => !!l)
}

export function StepTimeline({ steps }: { steps: FilmDetail['steps'] }) {
  return (
    <ol className="step-timeline" aria-label={vi.film.stepsLabel} aria-live="polite">
      {FILM_STEPS.map((step) => {
        const run = steps.find((s) => s.step === step)
        const status = run?.status ?? 'none'
        const duration = run && seconds(run)
        return (
          <li key={step} data-step={step} data-status={status} aria-current={status === 'running' ? 'step' : undefined}>
            <span className="step-marker" aria-hidden="true">{MARKERS[status]}</span>
            <span className="step-body">
              <b>{vi.steps[step]}</b>
              {status === 'failed' && errorLines(run?.error).map((line) => <span key={line} className="step-error">{line}</span>)}
            </span>
            <span className="step-status">{vi.stepStatus[status]}</span>
            {run && run.attempt > 1 && <span className="step-meta">{vi.film.attempt(run.attempt)}</span>}
            {duration && <span className="step-meta">{duration}</span>}
          </li>
        )
      })}
    </ol>
  )
}

/** The step rows folded under "Chi tiết các bước": there for whoever wants them, out of the way otherwise. */
export function StepDetails({ steps }: { steps: FilmDetail['steps'] }) {
  return (
    <details className="step-details">
      <summary>{vi.detail.steps}</summary>
      <StepTimeline steps={steps} />
    </details>
  )
}
