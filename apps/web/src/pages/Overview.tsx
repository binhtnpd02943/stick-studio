import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useFilmEvents } from '../api/events'
import { REVIEW_PREVIEW, useFilm, useFilms, useReviewPreview, useUsageToday, useWorkspace } from '../api/queries'
import type { FilmListItem } from '../api/schemas'
import { CostBadge, formatUsd } from '../components/CostBadge'
import { ErrorNotice } from '../components/ErrorNotice'
import { FilmCard } from '../components/FilmCard'
import { NewFilmButton } from '../components/NewFilmForm'
import { StatusPill } from '../components/StatusPill'
import { StepTimeline } from '../components/StepTimeline'
import { vi } from '../i18n/vi'
import { StickState } from '../stick/StickState'

export const MAX_LIVE_ON_OVERVIEW = 3
const REVIEW_CARDS = 3
const RECENT_ROWS = 5
const RECENT_FETCH = 12
const MOVING: readonly FilmListItem['status'][] = ['queued', 'running', 'awaiting_review']

/** One stream per card, so the page renders at most MAX_LIVE_ON_OVERVIEW of these. */
function LiveFilm({ film }: { film: FilmListItem }) {
  useFilmEvents(film.id)
  const detail = useFilm(film.id).data
  return (
    <article className="live-card">
      <div className="live-card-head">
        <Link to={`/films/${film.id}`}>{film.title}</Link>
        <StatusPill status={detail?.film.status ?? film.status} />
      </div>
      <div className="compact"><StepTimeline steps={detail?.steps ?? []} /></div>
    </article>
  )
}

function Section({ id, title, aside, children }: { id: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function Overview() {
  const runningQ = useFilms({ status: 'running' })
  const queuedQ = useFilms({ status: 'queued' })
  const reviewQ = useReviewPreview()
  const recent = useFilms({ limit: RECENT_FETCH }).data
  const usage = useUsageToday().data
  const workspace = useWorkspace().data

  const liveError = runningQ.error ?? queuedQ.error
  const liveLoaded = runningQ.isSuccess && queuedQ.isSuccess
  const live = [...(runningQ.data ?? []), ...(queuedQ.data ?? [])]
  const review = reviewQ.data
  const waiting = (review?.items ?? []).map(({ film }) => ({ ...film, timeline_url: null })) // the queue carries no timeline url
  const waitingCount = review?.more ? `${REVIEW_PREVIEW}+` : String(waiting.length)
  const finished = (recent ?? []).filter((f) => !MOVING.includes(f.status)).slice(0, RECENT_ROWS)

  return (
    <div className="page">
      <h1>{vi.nav.overview}</h1>
      <div className="hero">
        <div>
          <h2>{vi.overview.prompt}</h2>
          <p>{vi.overview.promptHint}</p>
        </div>
        <NewFilmButton primary />
      </div>
      {usage && workspace && (
        <Section id="today-cost" title={vi.overview.todayCost}>
          <CostBadge spentUsd={usage.total_usd} capUsd={workspace.effective_max_cost_per_day_usd} label={vi.overview.todayCost} />
        </Section>
      )}
      <Section
        id="running"
        title={liveLoaded ? `${vi.overview.running} · ${live.length}` : vi.overview.running}
        aside={liveLoaded && live.length > 0 && <Link to="/films?status=running">{vi.overview.seeAll}</Link>}
      >
        {liveError && <ErrorNotice error={liveError} />}
        {!liveError && !liveLoaded && <p>{vi.loading}</p>}
        {liveLoaded && live.length === 0 && <StickState kind="empty" label={vi.overview.runningEmpty} />}
        {live.slice(0, MAX_LIVE_ON_OVERVIEW).map((film) => <LiveFilm key={film.id} film={film} />)}
      </Section>
      <Section
        id="waiting"
        title={review ? `${vi.overview.waiting} · ${waitingCount}` : vi.overview.waiting}
        aside={<Link to="/review">{vi.overview.reviewLink}</Link>}
      >
        {reviewQ.error && <ErrorNotice error={reviewQ.error} />}
        {reviewQ.isPending && <p>{vi.loading}</p>}
        {review && waiting.length === 0 && <StickState kind="empty" label={vi.overview.waitingEmpty} />}
        <div className="film-grid film-grid-3">
          {waiting.slice(0, REVIEW_CARDS).map((film) => <FilmCard key={film.id} film={film} />)}
        </div>
      </Section>
      {finished.length > 0 && (
        <Section id="recent" title={vi.overview.recent}>
          {finished.map((f) => (
            <Link key={f.id} to={`/films/${f.id}`} className="recent-row">
              <b>{f.title}</b>
              <StatusPill status={f.status} />
              <span>{formatUsd(f.cost_usd)}</span>
              <span>{new Date(f.updated_at).toLocaleDateString('vi-VN')}</span>
            </Link>
          ))}
        </Section>
      )}
    </div>
  )
}
