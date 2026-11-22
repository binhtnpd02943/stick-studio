import type { Timeline } from '@stick/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { z } from 'zod/v4'
import { ApiError } from '../api/client'
import type { FilmListItem } from '../api/schemas'
import { ScenePreview } from '../stick/ScenePreview'
import { openingScene } from '../stick/timelines'
import { formatUsd } from './CostBadge'
import { StatusPill } from './StatusPill'

export type FilmCardFilm = Pick<FilmListItem, 'id' | 'title' | 'status' | 'cost_usd' | 'current_version' | 'timeline_url'>

// The worker wrote this file, so the engine trusts it; only what the card itself needs is checked.
const TimelineJson = z.custom<Timeline>((v) => Array.isArray((v as Timeline | null)?.scenes) && (v as Timeline).scenes.length > 0)

/** The timeline never changes within a film version, so it is keyed by film and version, not by the signed url (which differs on every list fetch). */
function useOpeningScene(film: FilmCardFilm): Timeline | undefined {
  const { timeline_url: url } = film
  const { data } = useQuery({
    queryKey: ['timeline', film.id, film.current_version],
    enabled: url !== null,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(url!, { credentials: 'same-origin' }).catch(() => { throw new ApiError(0, 'network', 'network error') })
      if (!res.ok) throw new ApiError(res.status, 'internal', 'timeline not available')
      return TimelineJson.parse(await res.json())
    },
  })
  return useMemo(() => (data ? openingScene(data) : undefined), [data])
}

const canHover = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches

export function FilmCard({ film }: { film: FilmCardFilm }) {
  const scene = useOpeningScene(film)
  return (
    <Link to={`/films/${film.id}`} className="film-card">
      <div className="film-thumb">
        {scene && <ScenePreview timeline={scene} trigger={canHover() ? 'hover' : 'view'} interactive={false} />}
      </div>
      <span className="film-card-title" title={film.title}>{film.title}</span>
      <span className="film-card-meta">
        <StatusPill status={film.status} />
        <span>{formatUsd(film.cost_usd)}</span>
      </span>
    </Link>
  )
}
