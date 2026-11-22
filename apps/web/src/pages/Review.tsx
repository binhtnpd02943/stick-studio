import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { type ReviewDecision, useFilm, useReviewFilm, useReviewQueue } from '../api/queries'
import type { FilmDetail, ReviewItem } from '../api/schemas'
import { ErrorNotice } from '../components/ErrorNotice'
import { ReviewCard } from '../components/ReviewCard'
import { vi } from '../i18n/vi'
import { StickState } from '../stick/StickState'

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
  if (outside && extra.isPending) return <p>{vi.loading}</p>

  const index = Math.min(picked ?? initial, items.length - 1)
  const current = items[index]
  if (!current) return <StickState kind="done" label={vi.review.empty} />

  const go = (direction: 'next' | 'prev') => {
    setPicked(Math.max(0, Math.min(items.length - 1, index + (direction === 'next' ? 1 : -1))))
    setToast(null)
    review.reset()
  }

  const decide = (decision: ReviewDecision, message: string) => {
    setToast(null)
    review.mutate(decision, {
      onSuccess: () => {
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
      <ReviewCard
        key={current.film.id}
        item={current}
        busy={review.isPending}
        notice={notice}
        onSwipe={go}
        onExpired={refetch}
        onApprove={() => decide({ id: current.film.id, decision: 'approved' }, vi.review.approved)}
        onRedo={(r) => decide({ id: current.film.id, decision: 'redo', ...r }, vi.review.redoSent(r.reason))}
      />
      <nav className="review-nav" aria-label={vi.nav.review}>
        <button type="button" disabled={index === 0} onClick={() => go('prev')}>{vi.review.prev}</button>
        <span className="review-counter">{vi.review.counter(index + 1, items.length)}</span>
        <button type="button" disabled={index === items.length - 1} onClick={() => go('next')}>{vi.review.next}</button>
      </nav>
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
