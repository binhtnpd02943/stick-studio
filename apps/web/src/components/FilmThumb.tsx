import type { Timeline } from '@stick/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router'
import { z } from 'zod/v4'
import { ApiError } from '../api/client'
import type { FilmListItem } from '../api/schemas'
import { ScenePreview } from '../stick/ScenePreview'
import { openingScene } from '../stick/timelines'
import { formatDuration } from './format'

export type ThumbFilm = Pick<FilmListItem, 'id' | 'current_version' | 'timeline_url'>

// The worker wrote this file, so the engine trusts it; only what the thumbnail itself needs is checked.
const TimelineJson = z.custom<Timeline>((v) => Array.isArray((v as Timeline | null)?.scenes) && (v as Timeline).scenes.length > 0)

/** The timeline never changes within a film version, so it is keyed by film and version, not by the signed url (which differs on every list fetch). */
export function useListTimeline(film: ThumbFilm): Timeline | undefined {
  const { timeline_url: url } = film
  const qc = useQueryClient()
  const refreshed = useRef(false)
  const { data, isError, refetch } = useQuery({
    queryKey: ['timeline', film.id, film.current_version],
    enabled: url !== null,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const res = await fetch(url!, { credentials: 'same-origin' }).catch(() => { throw new ApiError(0, 'network', 'network error') })
      if (res.status === 403 && !refreshed.current) {
        // The signed url expired (900 s) in a cached list: fetch fresh lists once; the effect below retries with the new url.
        refreshed.current = true
        void qc.invalidateQueries({ queryKey: ['films'] })
      }
      if (!res.ok) throw new ApiError(res.status, 'internal', 'timeline not available')
      return TimelineJson.parse(await res.json())
    },
  })
  useEffect(() => { if (isError) void refetch() }, [url]) // retry only when a new url arrives
  return data
}

const canHover = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches

/** A 9:16 still of the film's opening scene that plays on hover, with its length in the corner. */
export function FilmThumb({ film, children }: { film: ThumbFilm; children?: ReactNode }) {
  const timeline = useListTimeline(film)
  const scene = useMemo(() => (timeline ? openingScene(timeline) : undefined), [timeline])
  return (
    <div className="film-thumb">
      <Link to={`/films/${film.id}`} tabIndex={-1} aria-hidden="true" className="film-thumb-link">
        {scene && <ScenePreview timeline={scene} trigger={canHover() ? 'hover' : 'view'} interactive={false} />}
      </Link>
      {timeline && <span className="film-dur num">{formatDuration(timeline.duration)}</span>}
      {children}
    </div>
  )
}
