import { FILM_STEPS } from '@stick/core'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { filmLiveKey, type LiveState, useFilmLive } from './queries'
import { FilmDetail, FilmEvent } from './schemas'

const FINISHED = ['succeeded', 'failed', 'skipped']

/** Pure: fold one event into the cached detail. Events for an older version are ignored. */
export function applyFilmEvent(detail: FilmDetail, e: FilmEvent): FilmDetail {
  if (e.type === 'film') return { ...detail, film: { ...detail.film, status: e.status } }
  if (e.versionId !== detail.version.id) return detail
  const prev = detail.steps.find((s) => s.step === e.step)
  const next = {
    step: e.step,
    status: e.status,
    attempt: e.attempt,
    error: e.status === 'failed' ? prev?.error ?? null : null,
    started_at: e.status === 'running' ? e.at : prev?.started_at ?? null,
    finished_at: FINISHED.includes(e.status) ? e.at : null,
  }
  const steps = [...detail.steps.filter((s) => s.step !== e.step), next]
  return { ...detail, steps: steps.sort((a, b) => FILM_STEPS.indexOf(a.step) - FILM_STEPS.indexOf(b.step)) }
}

/** Streams a film's events into the query cache; `useFilm` polls instead while the stream is offline. */
export function useFilmEvents(filmId: string): { live: LiveState } {
  const qc = useQueryClient()
  useEffect(() => {
    const setLive = (state: LiveState) => qc.setQueryData(filmLiveKey(filmId), state)
    const refresh = (...keys: unknown[][]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey }))
    const es = new EventSource(`/v1/films/${filmId}/events`)
    setLive('connecting')

    /** A frame that fails to parse means the stream cannot be trusted: close it and let polling take over. */
    const on = (type: string, handle: (data: unknown) => void) =>
      es.addEventListener(type, (ev) => {
        try {
          handle(JSON.parse((ev as MessageEvent<string>).data))
        } catch (err) {
          console.warn(`film ${filmId}: bad ${type} event`, err)
          es.close()
          setLive('offline')
        }
      })

    on('snapshot', (data) => {
      qc.setQueryData(['film', filmId], FilmDetail.parse(data))
      setLive('live')
    })
    on('step', (data) => {
      const e = FilmEvent.parse(data)
      qc.setQueryData<FilmDetail>(['film', filmId], (d) => (d ? applyFilmEvent(d, e) : d))
      if (e.type === 'step' && (e.status === 'succeeded' || e.status === 'failed')) refresh(['film', filmId]) // new assets have no event
    })
    on('film', (data) => {
      const e = FilmEvent.parse(data)
      qc.setQueryData<FilmDetail>(['film', filmId], (d) => (d ? applyFilmEvent(d, e) : d))
      refresh(['film', filmId], ['film', filmId, 'versions'], ['films'])
    })
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) setLive('offline') }
    return () => es.close()
  }, [qc, filmId])
  return { live: useFilmLive(filmId) }
}
