import { type PointerEvent, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAssetUrl } from '../../api/queries'
import type { FilmDetail } from '../../api/schemas'
import { formatUsd } from '../../components/CostBadge'
import { Dialog } from '../../components/Dialog'
import { FilmPlayer } from '../../components/FilmPlayer'
import { formatDuration, relativeTime } from '../../components/format'
import { swipeDirection } from '../../components/swipe'
import { vi } from '../../i18n/vi'
import { type FilmFacts, assetOf, gateFindings } from './facts'
import { RedoBox } from './RedoBox'

const CONTROLS_BAND_PX = 56 // a drag that starts on the native video controls is a scrub, not a swipe

export interface Neighbours { index: number; count: number; prev: string | null; next: string | null }
interface DoneProps { detail: FilmDetail; facts: FilmFacts; redoOpen?: boolean }

function QaChip({ detail, short = false }: { detail: FilmDetail; short?: boolean }) {
  if (detail.film.status !== 'qa_failed') return <span className="chip chip-ok">{short ? vi.detail.qaOkShort : vi.detail.qaOk}</span>
  return <span className="chip chip-warn">{vi.detail.qaWarn(gateFindings(detail.steps)?.length ?? 0)}</span>
}

/** The final video's signed same-origin url, for a plain download link. */
function useFinalUrl(detail: FilmDetail): string | null {
  return useAssetUrl(assetOf(detail.assets, 'final')).data?.url ?? null
}

function Download({ detail, className, label }: { detail: FilmDetail; className: string; label: string }) {
  const url = useFinalUrl(detail)
  if (!url) return <button type="button" className={className} disabled>{label}</button>
  return <a href={url} download className={`${className} link-button`}>{label}</a>
}

function Meta({ detail, facts }: { detail: FilmDetail; facts: FilmFacts }) {
  const { film } = detail
  const scenes = facts.screenplay?.scenes.length ?? facts.timeline?.scenes.length
  const cast = facts.screenplay?.cast.map((c) => c.name).join(', ')
  return (
    <p className="film-meta">
      {facts.timeline && <span className="num">{formatDuration(facts.timeline.duration)}</span>}
      {scenes !== undefined && <span>{vi.detail.scenes(scenes)}</span>}
      {cast && <span>{cast}</span>}
      <span className="num">{formatUsd(film.cost_usd)}</span>
      <span><span className="film-status" data-status={film.status}>{vi.status[film.status]}</span> · {relativeTime(film.updated_at)}</span>
    </p>
  )
}

/** Desktop: a 360px player beside the title, facts, actions and the redo box. */
export function FilmDoneDesktop({ detail, facts, redoOpen = false }: DoneProps) {
  const { film } = detail
  return (
    <div className="film-top">
      <section className="film-player-box" aria-label={vi.detail.video}><FilmPlayer assetId={assetOf(detail.assets, 'final')} /></section>
      <div className="film-side">
        <div className="film-head">
          <h1>{film.title}</h1>
          <Meta detail={detail} facts={facts} />
          <QaChip detail={detail} />
        </div>
        <div className="film-acts">
          <div className="film-acts-row">
            <Download detail={detail} className="primary" label={vi.detail.download} />
            <button type="button" className="secondary" disabled aria-describedby="publish-note">{vi.detail.publish}</button>
          </div>
          <p id="publish-note" className="note">{vi.detail.publishNote} <Link to="/settings">{vi.detail.publishLink}</Link></p>
        </div>
        <RedoBox film={film} autoFocus={redoOpen} />
      </div>
    </div>
  )
}

/** Phone: the video fills the width, swipes move between finished films, and a dock holds the actions. */
export function FilmDonePhone({ detail, facts, neighbours, redoOpen = false }: DoneProps & { neighbours: Neighbours | null }) {
  const { film } = detail
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(redoOpen)
  const start = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const onControls = e.currentTarget.getBoundingClientRect().bottom - e.clientY < CONTROLS_BAND_PX
    start.current = onControls ? null : { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const from = start.current
    start.current = null
    const direction = from && swipeDirection(e.clientX - from.x, e.clientY - from.y)
    const to = direction && neighbours?.[direction]
    if (to) void navigate(`/films/${to}`)
  }
  return (
    <div className="film-phone">
      <div className="film-phone-top">
        <Link to="/films" className="back-link">{vi.detail.back}</Link>
        {neighbours && neighbours.count > 1 && <span className="note">{vi.detail.position(neighbours.index + 1, neighbours.count)}</span>}
      </div>
      <div className="film-phone-video" aria-label={vi.detail.video} role="region" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null }}>
        <FilmPlayer assetId={assetOf(detail.assets, 'final')} />
      </div>
      <div className="film-phone-info">
        <h1>{film.title}</h1>
        <p className="film-meta">
          {facts.timeline && <span className="num">{formatDuration(facts.timeline.duration)}</span>}
          {facts.screenplay && <span>{vi.detail.scenes(facts.screenplay.scenes.length)}</span>}
          <QaChip detail={detail} short />
        </p>
      </div>
      <div className="dock">
        <button type="button" className="secondary" onClick={() => setSheet(true)}>{vi.card.redo}</button>
        <button type="button" className="secondary" disabled>{vi.card.publish}</button>
        <Download detail={detail} className="primary" label={vi.card.download} />
      </div>
      {sheet && (
        <Dialog title={vi.card.redo} onClose={() => setSheet(false)}>
          <RedoBox film={film} autoFocus onDone={() => setSheet(false)} />
        </Dialog>
      )}
    </div>
  )
}
