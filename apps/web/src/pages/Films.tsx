import { FILM_STATUSES } from '@stick/core'
import { useSearchParams } from 'react-router'
import { useFilmPages } from '../api/queries'
import { FilmStatus } from '../api/schemas'
import { ErrorNotice } from '../components/ErrorNotice'
import { FilmCard } from '../components/FilmCard'
import { NewFilmButton } from '../components/NewFilmForm'
import { vi } from '../i18n/vi'
import { StickState } from '../stick/StickState'

export function Films() {
  const [params, setParams] = useSearchParams()
  const status = FilmStatus.safeParse(params.get('status')).data // an unknown ?status= shows everything
  const films = useFilmPages({ status })
  const items = films.data?.pages.flatMap((p) => p.items) ?? []

  const filter = (next: typeof status) => setParams(next ? { status: next } : {})
  return (
    <div className="page">
      <div className="page-head">
        <h1>{vi.nav.films}</h1>
        <NewFilmButton primary />
      </div>
      <div>
        <ul className="filter-pills" aria-label={vi.films.filters}>
          <li><button type="button" aria-pressed={!status} onClick={() => filter(undefined)}>{vi.films.all}</button></li>
          {FILM_STATUSES.map((s) => (
            <li key={s}><button type="button" aria-pressed={status === s} onClick={() => filter(s)}>{vi.status[s]}</button></li>
          ))}
        </ul>
        {films.error && <ErrorNotice error={films.error} />}
        {films.isPending && !films.error && <p>{vi.loading}</p>}
        {films.isSuccess && items.length === 0 && <StickState kind="empty" label={vi.films.empty} />}
        <div className="film-grid">
          {items.map((film) => <FilmCard key={film.id} film={film} />)}
        </div>
        {films.hasNextPage && (
          <button type="button" className="load-more" disabled={films.isFetchingNextPage} onClick={() => void films.fetchNextPage()}>
            {films.isFetchingNextPage ? vi.loading : vi.films.more}
          </button>
        )}
      </div>
    </div>
  )
}
