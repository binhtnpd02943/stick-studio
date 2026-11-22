import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useFilmEvents } from '../api/events'
import { useFilm, useFilms } from '../api/queries'
import type { FilmDetail as Detail, FilmStatus } from '../api/schemas'
import { ErrorNotice } from '../components/ErrorNotice'
import { StepDetails } from '../components/StepTimeline'
import { PHONE_QUERY, useMedia } from '../components/use-media'
import { vi } from '../i18n/vi'
import { useFilmFacts, type FilmFacts } from './film/facts'
import { FilmDoneDesktop, FilmDonePhone, type Neighbours } from './film/FilmDone'
import { FilmRunning } from './film/FilmRunning'
import { FilmStopped } from './film/FilmStopped'
import { QaTab } from './film/QaTab'
import { ScreenplayTab } from './film/ScreenplayTab'
import { VersionsTab } from './film/VersionsTab'
import { finishedOf } from './Overview'

const TAB_IDS = ['screenplay', 'qa', 'versions'] as const
type TabId = (typeof TAB_IDS)[number]
const IN_FLIGHT: readonly FilmStatus[] = ['queued', 'running']
const STOPPED: readonly FilmStatus[] = ['failed', 'cancelled', 'blocked_budget']
const NEIGHBOUR_FETCH = 24 // the same page the overview picks its finished films from

const isTab = (v: string | null): v is TabId => (TAB_IDS as readonly string[]).includes(v ?? '')

/**
 * The active tab lives in ?tab=, so a link (the card's "Xem lỗi") can open one. A panel mounts on first visit and then
 * stays (hidden), so an open edit survives a trip to another tab.
 */
function Tabs({ labels, panel }: { labels: Record<TabId, ReactNode>; panel: (tab: TabId) => ReactNode }) {
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const active: TabId = isTab(asked) ? asked : 'screenplay'
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set([active]))
  if (!visited.has(active)) setVisited(new Set(visited).add(active)) // a tab opened by a link
  const show = (id: TabId) => setParams(id === 'screenplay' ? {} : { tab: id }, { replace: true, preventScrollReset: true })
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (e: KeyboardEvent, from: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = TAB_IDS[(from + step + TAB_IDS.length) % TAB_IDS.length]!
    show(next)
    refs.current[next]?.focus()
  }
  return (
    <section className="film-tabs" id="film-tabs">
      <div role="tablist" aria-label={vi.detail.tabs} className="tabs">
        {TAB_IDS.map((id, i) => (
          <button
            key={id} ref={(el) => { refs.current[id] = el }} type="button" role="tab" id={`tab-${id}`}
            aria-selected={active === id} aria-controls={`panel-${id}`} tabIndex={active === id ? 0 : -1}
            onClick={() => show(id)} onKeyDown={(e) => move(e, i)}
          >
            {labels[id]}
          </button>
        ))}
      </div>
      {TAB_IDS.filter((id) => visited.has(id)).map((id) => (
        <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={active !== id}>{panel(id)}</div>
      ))}
    </section>
  )
}

function FilmTabs({ detail, facts }: { detail: Detail; facts: FilmFacts }) {
  const { film, steps, assets } = detail
  return (
    <Tabs
      labels={{ screenplay: vi.detail.tabScreenplay, qa: vi.detail.tabQa, versions: vi.detail.tabVersions(film.current_version) }}
      panel={(id) =>
        id === 'screenplay' ? <ScreenplayTab film={film} facts={facts} />
        : id === 'qa' ? <QaTab film={film} steps={steps} assets={assets} />
        : <VersionsTab film={film} />}
    />
  )
}

/** Where this film sits among the finished films, for the phone's swipe. */
function useNeighbours(id: string, enabled: boolean): Neighbours | null {
  const list = useFilms({ limit: NEIGHBOUR_FETCH }, enabled)
  if (!enabled || !list.data) return null
  const finished = finishedOf(list.data)
  const index = finished.findIndex((f) => f.id === id)
  if (index < 0) return null
  return { index, count: finished.length, prev: finished[index - 1]?.id ?? null, next: finished[index + 1]?.id ?? null }
}

function Done({ detail }: { detail: Detail }) {
  const phone = useMedia(PHONE_QUERY)
  const facts = useFilmFacts(detail)
  const redoOpen = useLocation().hash === '#redo'
  const neighbours = useNeighbours(detail.film.id, phone)
  if (phone) return <FilmDonePhone detail={detail} facts={facts} neighbours={neighbours} redoOpen={redoOpen} />
  return (
    <>
      <FilmDoneDesktop detail={detail} facts={facts} redoOpen={redoOpen} />
      <FilmTabs detail={detail} facts={facts} />
      <StepDetails steps={detail.steps} />
    </>
  )
}

function Stopped({ detail }: { detail: Detail }) {
  const facts = useFilmFacts(detail)
  return (
    <>
      <FilmStopped detail={detail} />
      <FilmTabs detail={detail} facts={facts} />
    </>
  )
}

export function FilmDetail() {
  const { id = '' } = useParams()
  useFilmEvents(id)
  const query = useFilm(id)

  // A failed refetch keeps the data: show the page with a banner, so an open edit is not unmounted.
  if (!query.data) return query.error ? <ErrorNotice error={query.error} /> : <p className="muted">{vi.loading}</p>
  const detail = query.data
  const { film } = detail
  const body = IN_FLIGHT.includes(film.status) ? <FilmRunning detail={detail} />
    : STOPPED.includes(film.status) ? <Stopped detail={detail} />
    : <Done detail={detail} />

  return (
    <div className="page film-page" data-film-status={film.status}>
      {query.error && <ErrorNotice error={query.error} />}
      <nav aria-label={vi.detail.crumb} className="crumb">
        <Link to="/films">{vi.nav.films}</Link> <span aria-hidden="true">/</span> <span aria-current="page">{film.title}</span>
      </nav>
      {body}
    </div>
  )
}
