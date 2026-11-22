import { useRef, useState } from 'react'
import { Link } from 'react-router'
import type { FilmListItem } from '../api/schemas'
import { vi } from '../i18n/vi'
import { formatUsd } from './CostBadge'
import { FilmThumb } from './FilmThumb'
import { downloadName, relativeTime } from './format'
import { useDismiss } from './use-dismiss'

/** "⋯": for now only Làm lại, which opens the film page at its redo box. */
function MoreMenu({ film }: { film: FilmListItem }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), box)
  const menuId = `more-${film.id}`
  return (
    <div className="more" ref={box}>
      <button type="button" className="more-button" aria-label={vi.card.more} aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id={menuId} className="more-menu">
          <Link to={`/films/${film.id}#redo`}>{vi.card.redo}</Link>
        </div>
      )}
    </div>
  )
}

/** A finished film on the overview: thumbnail, title, cost and age, and what to do with it next. */
export function FinishedCard({ film }: { film: FilmListItem }) {
  const failed = film.status === 'qa_failed'
  return (
    <article className="finished-card">
      <FilmThumb film={film}>{failed && <span className="film-flag">{vi.card.flag}</span>}</FilmThumb>
      <Link to={`/films/${film.id}`} className="finished-title">{film.title}</Link>
      <span className="finished-meta"><span className="num">{formatUsd(film.cost_usd)}</span> · {relativeTime(film.updated_at)}</span>
      <div className="finished-acts">
        {failed ? (
          <Link to={`/films/${film.id}?tab=qa`} className="quiet link-button">{vi.card.seeIssues}</Link>
        ) : film.final_url ? (
          <a href={film.final_url} download={downloadName(film.title)} className="quiet link-button">{vi.card.download}</a>
        ) : null}
        {/* Publishing is not built yet: the film page says why. */}
        <button type="button" disabled>{vi.card.publish}</button>
        <MoreMenu film={film} />
      </div>
    </article>
  )
}
