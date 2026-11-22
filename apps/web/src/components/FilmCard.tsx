import { Link } from 'react-router'
import type { FilmListItem } from '../api/schemas'
import { formatUsd } from './CostBadge'
import { FilmThumb } from './FilmThumb'
import { StatusPill } from './StatusPill'

export type FilmCardFilm = Pick<FilmListItem, 'id' | 'title' | 'status' | 'cost_usd' | 'current_version' | 'timeline_url'>

/** A film in the films list: thumbnail, title, status and cost. */
export function FilmCard({ film }: { film: FilmCardFilm }) {
  return (
    <article className="film-card">
      <FilmThumb film={film} />
      <Link to={`/films/${film.id}`} className="film-card-title" title={film.title}>{film.title}</Link>
      <span className="film-card-meta">
        <StatusPill status={film.status} />
        <span className="num">{formatUsd(film.cost_usd)}</span>
      </span>
    </article>
  )
}
