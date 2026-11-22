import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { type ReviewDecision, useFilm, useReviewFilm, useReviewQueue } from '../api/queries'
import type { FilmDetail, ReviewItem } from '../api/schemas'
import { ErrorNotice } from '../components/ErrorNotice'
import { ReviewCard } from '../components/ReviewCard'
import { vi } from '../i18n/vi'
import { StickState } from '../stick/StickState'

// ReviewCard's title and StickState's caption are tabIndex -1, so a decision can land focus on them.
const FOCUS_TARGET = '.review-card h2, .stick-state figcaption'
const REVIEWABLE: readonly string[] = ['awaiting_review', 'qa_failed']

/** A film outside the loaded queue page, shaped like a queue item; its video is fetched by asset id, so it has no signed url. */
function itemFromDetail({ film, steps, assets }: FilmDetail): ReviewItem {
  const gate = steps.find((s) => s.step === 'gate')
  return {
    film: { id: film.id, title: film.title, status: film.status, cost_usd: film.cost_usd, current_version: film.current_version },
    final_asset_id: assets.find((a) => a.kind === 'final')?.id ?? null,
    final_url: null,
    contact_asset_id: assets.find((a) => a.kind === 'contact_sheet')?.id ?? null,
    timeline_url: null,
    findings: film.status === 'qa_failed' && gate?.status === 'failed' ? gate.error : null,
  }
}

/** Mounts once the queue has loaded, so the `?film=` start (and whether it needs a fetch) is decided once, not re-read as decisions shrink the queue. */
function ReviewSession({ queued, refetch }: { queued: ReviewItem[]; refetch: () => void }) {
  const [params] = useSearchParams()
  const qc = useQueryClient()
  const review = useReviewFilm()
  const [startId] = useState(() => params.get('film'))
  const [outside] = useState(() => startId !== null && !queued.some((i) => i.film.id === startId))
  const [initial] = useState(() => Math.max(0, queued.findIndex((i) => i.film.id === startId)))
  const [picked, setPicked] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const extra = useFilm(startId ?? '', outside)
  const pinned = extra.data && REVIEWABLE.includes(extra.data.film.status) ? itemFromDetail(extra.data) : null
  const items = pinned ? [pinned, ...queued] : queued

  const index = Math.min(picked ?? initial, items.length - 1)
  const current = items[index]
  // The decided card unmounts with the focused button on it; hand focus to whatever replaces it (WCAG 2.4.3).
  const decidedId = useRef<string | null>(null)
  useEffect(() => {
    if (decidedId.current === null || decidedId.current === current?.film.id) return
    decidedId.current = null
    document.querySelector<HTMLElement>(FOCUS_TARGET)?.focus()
  })
  if (outside && extra.isPending) return <p>{vi.loading}</p>
  if (!current) return <StickState kind="done" label={vi.review.empty} />

  const busy = review.isPending
  const go = (direction: 'next' | 'prev') => {
    if (busy) return // reset() would drop the in-flight decision's callbacks (toast, queue removal, 409 refetch)
    setPicked(Math.max(0, Math.min(items.length - 1, index + (direction === 'next' ? 1 : -1))))
    setToast(null)
    review.reset()
  }

  const decide = (decision: ReviewDecision, message: string) => {
    setToast(null)
    review.mutate(decision, {
      onSuccess: () => {
        decidedId.current = decision.id
        qc.setQueryData<ReviewItem[]>(['review-queue'], (old) => old?.filter((i) => i.film.id !== decision.id))
        setToast(message)
      },
      onError: (e) => { if (e instanceof ApiError && e.code === 'conflict') refetch() },
    })
  }

  const failure = review.error
  const notice = failure
    ? (failure instanceof ApiError && failure.code === 'conflict' ? <p role="alert" className="error-notice">{vi.review.conflict}</p> : <ErrorNotice error={failure} />)
    : toast && <p role="status" className="review-toast">{toast}</p>

  return (
    <>
      <nav className="review-nav" aria-label={vi.nav.review}>
        <button type="button" disabled={busy || index === 0} onClick={() => go('prev')}>{vi.review.prev}</button>
        <span className="review-counter">{vi.review.counter(index + 1, items.length)}</span>
        <button type="button" disabled={busy || index === items.length - 1} onClick={() => go('next')}>{vi.review.next}</button>
      </nav>
      <ReviewCard
        key={current.film.id}
        item={current}
        busy={busy}
        notice={notice}
        onSwipe={go}
        onExpired={refetch}
        onApprove={() => decide({ id: current.film.id, decision: 'approved' }, vi.review.approved)}
        onRedo={(r) => decide({ id: current.film.id, decision: 'redo', ...r }, vi.review.redoSent(r.reason))}
      />
    </>
  )
}

export function Review() {
  const queue = useReviewQueue()
  return (
    <div className="review-page">
      <h1 className="sr-only">{vi.nav.review}</h1>
      {queue.isError && <ErrorNotice error={queue.error} />}
      {queue.isPending ? <p>{vi.loading}</p> : queue.data && <ReviewSession queued={queue.data} refetch={() => void queue.refetch()} />}
    </div>
  )
}
