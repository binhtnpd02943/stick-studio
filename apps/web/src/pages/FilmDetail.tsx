import { type KeyboardEvent, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useFilmEvents } from '../api/events'
import { useFilm } from '../api/queries'
import { formatUsd } from '../components/CostBadge'
import { ErrorNotice } from '../components/ErrorNotice'
import { FilmPlayer } from '../components/FilmPlayer'
import { StatusPill } from '../components/StatusPill'
import { StepTimeline } from '../components/StepTimeline'
import { StudioFloor } from '../components/studio/StudioFloor'
import { vi } from '../i18n/vi'
import { FilmActions } from './film/FilmActions'
import { QaTab } from './film/QaTab'
import { ScreenplayTab } from './film/ScreenplayTab'
import { VersionsTab } from './film/VersionsTab'

const TABS = [
  { id: 'screenplay', label: vi.detail.tabScreenplay },
  { id: 'qa', label: vi.detail.tabQa },
  { id: 'versions', label: vi.detail.tabVersions },
] as const
type TabId = (typeof TABS)[number]['id']

/** A panel mounts on first visit and then stays (hidden), so an open edit survives a trip to another tab. */
function Tabs({ panel }: { panel: (tab: TabId) => React.ReactNode }) {
  const [active, setActive] = useState<TabId>('screenplay')
  const [visited, setVisited] = useState<ReadonlySet<TabId>>(() => new Set(['screenplay']))
  const show = (id: TabId) => {
    setActive(id)
    setVisited((v) => new Set(v).add(id))
  }
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (e: KeyboardEvent, from: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = TABS[(from + step + TABS.length) % TABS.length]!
    show(next.id)
    refs.current[next.id]?.focus()
  }
  return (
    <section>
      <div role="tablist" aria-label={vi.detail.tabs} className="tabs">
        {TABS.map((t, i) => (
          <button
            key={t.id} ref={(el) => { refs.current[t.id] = el }} type="button" role="tab" id={`tab-${t.id}`}
            aria-selected={active === t.id} aria-controls={`panel-${t.id}`} tabIndex={active === t.id ? 0 : -1}
            onClick={() => show(t.id)} onKeyDown={(e) => move(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.filter((t) => visited.has(t.id)).map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>{panel(t.id)}</div>
      ))}
    </section>
  )
}

export function FilmDetail() {
  const { id = '' } = useParams()
  useFilmEvents(id)
  const query = useFilm(id)

  // A failed refetch keeps the data: show the page with a banner, so an open edit is not unmounted.
  if (!query.data) return query.error ? <ErrorNotice error={query.error} /> : <p>{vi.loading}</p>
  const { film, version, steps, assets } = query.data
  const final = assets.find((a) => a.kind === 'final')
  const reviewable = film.status === 'awaiting_review' || film.status === 'qa_failed'

  return (
    <div className="page film-detail">
      {query.error && <ErrorNotice error={query.error} />}
      <Link to="/films" className="back-link">{vi.detail.back}</Link>
      <div className="film-detail-grid">
        <section className="film-detail-video" aria-label={vi.detail.video}><FilmPlayer assetId={final?.id ?? null} /></section>
        <section className="film-detail-info">
          <div className="film-detail-head">
            <h1>{film.title}</h1>
            <StatusPill status={film.status} />
          </div>
          <p className="film-detail-meta">
            <span>{formatUsd(film.cost_usd)}</span> · <span>v{version.version} · {version.reason}</span>
          </p>
          <div className="film-detail-actions">
            <FilmActions film={film} />
            {reviewable && <Link to={`/review?film=${film.id}`} className="primary link-button">{vi.detail.review}</Link>}
          </div>
          <StudioFloor detail={query.data} collapsible={film.status !== 'queued' && film.status !== 'running'} />
          <StepTimeline steps={steps} />
        </section>
      </div>
      <Tabs
        panel={(tab) =>
          tab === 'screenplay' ? <ScreenplayTab film={film} assets={assets} />
          : tab === 'qa' ? <QaTab film={film} steps={steps} assets={assets} />
          : <VersionsTab film={film} />}
      />
    </div>
  )
}
