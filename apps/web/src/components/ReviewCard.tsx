import { type PointerEvent, type ReactNode, useRef, useState } from 'react'
import type { ReviewItem } from '../api/schemas'
import { vi } from '../i18n/vi'
import { Dialog } from './Dialog'
import { FilmPlayer } from './FilmPlayer'
import { IssueList, findingText } from './IssueList'
import { swipeDirection } from './swipe'

const REASON_MAX = 500
const CONTROLS_BAND_PX = 56 // a drag that starts on the native video controls is a scrub, not a swipe

// Spec §10: each quick reason restarts the film from this step.
const QUICK_REASONS = [
  { key: 'knowledge', step: 'story' },
  { key: 'confusing', step: 'screenplay' },
  { key: 'voice', step: 'voice' },
  { key: 'pacing', step: 'screenplay' },
  { key: 'other', step: 'story' },
] as const

export interface RedoRequest { reason: string; redo_from_step: string }

interface ReviewCardProps {
  item: ReviewItem
  onApprove: () => void
  onRedo: (request: RedoRequest) => void
  busy: boolean
  /** The signed `final_url` ran out: the owner supplies a fresh one. */
  onExpired?: () => void
  onSwipe?: (direction: 'next' | 'prev') => void
  /** A toast or error line, shown above the buttons (and inside the sheet while it is open). */
  notice?: ReactNode
}

/** The gate step's error carries `details.findings`; anything else counts as none. */
function qaFindings(item: ReviewItem): string[] {
  const findings = (item.findings as { details?: { findings?: unknown } } | null)?.details?.findings
  return Array.isArray(findings) ? findings.map(findingText) : []
}

function RedoSheet({ busy, notice, onClose, onSend }: { busy: boolean; notice: ReactNode; onClose: () => void; onSend: (r: RedoRequest) => void }) {
  const [picked, setPicked] = useState<(typeof QUICK_REASONS)[number] | null>(null)
  const [note, setNote] = useState('')
  const label = picked ? vi.review.reasons[picked.key] : ''
  const trimmed = note.trim()
  return (
    <Dialog title={vi.review.sheetTitle} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (picked) onSend({ reason: trimmed ? `${label}: ${trimmed}` : label, redo_from_step: picked.step })
        }}
      >
        <div role="group" aria-label={vi.review.reasonsLabel} className="review-chips">
          {QUICK_REASONS.map((reason) => (
            <button key={reason.key} type="button" className="chip" aria-pressed={picked?.key === reason.key} onClick={() => setPicked(reason)}>
              {vi.review.reasons[reason.key]}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="review-note">{vi.review.note}</label>
          <textarea id="review-note" rows={3} maxLength={REASON_MAX - label.length - 2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {notice}
        <button type="submit" className="primary" disabled={!picked || busy}>{vi.review.send}</button>
      </form>
    </Dialog>
  )
}

export function ReviewCard({ item, onApprove, onRedo, busy, onExpired, onSwipe, notice }: ReviewCardProps) {
  const [sheet, setSheet] = useState(false)
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const { film } = item
  const failed = film.status === 'qa_failed'
  const findings = qaFindings(item)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const onControls = e.currentTarget.getBoundingClientRect().bottom - e.clientY < CONTROLS_BAND_PX
    swipeStart.current = onControls ? null : { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    const direction = start && swipeDirection(e.clientX - start.x, e.clientY - start.y)
    if (direction) onSwipe?.(direction)
  }

  return (
    <article className="review-card" aria-label={film.title}>
      <div className="review-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipeStart.current = null }}>
        <FilmPlayer src={item.final_url} assetId={item.final_asset_id} onExpired={onExpired} autoPlay />
        <div className="review-top">
          <h2 tabIndex={-1}>{film.title}</h2>
          {failed && (
            <details className="review-qa">
              <summary>{vi.review.qaFailed(findings.length)}</summary>
              <IssueList issues={findings} />
            </details>
          )}
        </div>
      </div>
      <div className="review-bar">
        {!sheet && notice}
        <div className="review-buttons">
          {!failed && <button type="button" className="primary review-approve" disabled={busy} onClick={onApprove}>{vi.review.approve}</button>}
          <button type="button" className="review-redo" disabled={busy} onClick={() => setSheet(true)}>{vi.review.redo}</button>
        </div>
      </div>
      {sheet && <RedoSheet busy={busy} notice={notice} onClose={() => setSheet(false)} onSend={onRedo} />}
    </article>
  )
}
