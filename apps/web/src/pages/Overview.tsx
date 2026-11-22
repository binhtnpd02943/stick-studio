import { type FormEvent, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useFilmEvents } from '../api/events'
import { useChannels, useCreateFilm, useFilm, useFilms } from '../api/queries'
import type { FilmListItem, FilmStatus } from '../api/schemas'
import { formatUsd } from '../components/CostBadge'
import { ErrorNotice } from '../components/ErrorNotice'
import { FinishedCard } from '../components/FinishedCard'
import { StepProgress, workLine } from '../components/StepProgress'
import { memberOf } from '../components/studio/team'
import { deriveFloor } from '../components/studio/floor-state'
import { vi } from '../i18n/vi'

export const MAX_LIVE_ON_OVERVIEW = 3
export const MAX_FINISHED = 8
export const TOPIC_MAX = 80
const RECENT_FETCH = 24 // shortcut: finished films are picked from the newest page; a status filter on the API would be exact
export const FINISHED: readonly FilmStatus[] = ['awaiting_review', 'approved', 'published', 'qa_failed']

/** Finished films, newest first. */
export const finishedOf = (films: readonly FilmListItem[]) =>
  films.filter((f) => FINISHED.includes(f.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))

/** One Idempotency-Key per topic: a retry of the same topic creates the film once, a new topic gets a new key. */
function useTopicKey() {
  const ref = useRef<{ topic: string; key: string } | null>(null)
  return (topic: string) => {
    if (ref.current?.topic !== topic) ref.current = { topic, key: crypto.randomUUID() }
    return ref.current.key
  }
}

function Compose({ avgCost }: { avgCost: number | null }) {
  const navigate = useNavigate()
  const channels = useChannels()
  const create = useCreateFilm()
  const keyFor = useTopicKey()
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const channel = channels.data?.[0]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const title = topic.trim()
    const problem = title === '' ? vi.overview.topicRequired : title.length > TOPIC_MAX ? vi.overview.topicTooLong(TOPIC_MAX) : null
    setError(problem)
    if (problem || !channel) return
    create.mutate({ channel_id: channel.id, title, idempotencyKey: keyFor(title) }, { onSuccess: (film) => void navigate(`/films/${film.id}`) })
  }

  return (
    <section className="compose" aria-labelledby="compose-h">
      <h1 id="compose-h">{vi.overview.prompt}</h1>
      <form className="compose-field" onSubmit={submit} noValidate>
        <input
          aria-label={vi.overview.topic} placeholder={vi.overview.topicPlaceholder} value={topic} maxLength={TOPIC_MAX * 2}
          aria-invalid={error !== null} aria-describedby="compose-hint" onChange={(e) => setTopic(e.target.value)}
        />
        <button type="submit" className="primary" disabled={create.isPending || !channel}>{create.isPending ? vi.overview.making : vi.overview.make}</button>
      </form>
      {error && <p role="alert" className="compose-error">{error}</p>}
      {create.error && <ErrorNotice error={create.error} />}
      {channels.isSuccess && !channel && <p className="hint">{vi.overview.noChannel} <Link to="/settings">{vi.overview.addChannel}</Link></p>}
      <p id="compose-hint" className="hint">{avgCost ? vi.overview.hintCost(`~${formatUsd(avgCost)}`) : vi.overview.hint}</p>
    </section>
  )
}

function Figure({ ink }: { ink: string }) {
  return (
    <svg className="job-figure" width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="var(--soft)" />
      <g fill="none" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="24" cy="20" r="6" />
        <path d="M24 26 L24 40 M24 31 L34 36 M24 40 L20 52 M24 40 L30 50" />
      </g>
      <path d="M34 40 h20 M38 40 v-10 h14 v10" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="40" y="32" width="10" height="6" fill="var(--accent)" />
    </svg>
  )
}

/** One stream per row, so the page opens at most MAX_LIVE_ON_OVERVIEW of these. */
function RunningRow({ film }: { film: FilmListItem }) {
  useFilmEvents(film.id)
  const detail = useFilm(film.id).data
  const who = detail ? deriveFloor(detail).working ?? 'intake' : 'intake'
  return (
    <article className="job">
      <Figure ink={memberOf(who).ink} />
      <div className="job-body">
        <Link to={`/films/${film.id}`} className="job-title">{film.title}</Link>
        <span className="job-who">{detail ? workLine(detail) : vi.loading}</span>
        <StepProgress detail={detail ?? { steps: [] }} />
      </div>
      <Link to={`/films/${film.id}`} className="quiet link-button">{vi.overview.watch}</Link>
    </article>
  )
}

function Running() {
  const runningQ = useFilms({ status: 'running' })
  const queuedQ = useFilms({ status: 'queued' })
  const error = runningQ.error ?? queuedQ.error
  const loaded = runningQ.isSuccess && queuedQ.isSuccess
  const live = [...(runningQ.data ?? []), ...(queuedQ.data ?? [])]
  return (
    <section className="section" aria-labelledby="running-h">
      <div className="section-head">
        <h2 id="running-h">{vi.overview.running}{loaded && <> <span className="count">· {live.length}</span></>}</h2>
      </div>
      {error && <ErrorNotice error={error} />}
      {!error && !loaded && <p className="muted">{vi.loading}</p>}
      {loaded && live.length === 0 && <p className="muted">{vi.overview.runningEmpty}</p>}
      {live.slice(0, MAX_LIVE_ON_OVERVIEW).map((film) => <RunningRow key={film.id} film={film} />)}
    </section>
  )
}

export function Overview() {
  const recent = useFilms({ limit: RECENT_FETCH })
  const finished = finishedOf(recent.data ?? []).slice(0, MAX_FINISHED)
  const costs = finished.map((f) => f.cost_usd).filter((c) => c > 0)
  const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null

  return (
    <div className="page">
      <Compose avgCost={avgCost} />
      <Running />
      <section className="section" aria-labelledby="done-h">
        <div className="section-head">
          <h2 id="done-h">{vi.overview.done}{recent.isSuccess && <> <span className="count">· {finished.length}</span></>}</h2>
          <Link to="/films" className="section-link">{vi.overview.allFilms}</Link>
        </div>
        {recent.error && <ErrorNotice error={recent.error} />}
        {recent.isPending && <p className="muted">{vi.loading}</p>}
        {recent.isSuccess && finished.length === 0 && <p className="muted">{vi.overview.doneEmpty}</p>}
        {finished.length > 0 && <div className="finished-grid">{finished.map((f) => <FinishedCard key={f.id} film={f} />)}</div>}
      </section>
    </div>
  )
}
