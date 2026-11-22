import { type QueryKey, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { z } from 'zod/v4'
import { ApiError, apiFetch, setCsrfToken } from './client'
import { OWNS_UNAUTHORIZED } from './query-client'
import {
  AssetUrl, Channel, Character, Film, FilmDetail, FilmListItem, type FilmStatus, LoginResult, Me, ReviewItem, Usage, Version, Workspace,
} from './schemas'

const PAGE = 'limit=100' // shortcut: first page only; add cursor paging when a list outgrows 100.
const ASSET_URL_STALE_MS = 10 * 60_000 // the signed url lives 900 s
const FILM_POLL_MS = 5_000 // never faster than the rate budget allows

const read = <T>(path: string, schema: z.ZodType<T>) => async (): Promise<T> => (await apiFetch(path, schema)).data

export type LiveState = 'connecting' | 'live' | 'offline'
/** Outside the ['film', id] prefix so invalidating a film never resets the stream state. */
export const filmLiveKey = (id: string): QueryKey => ['film-live', id]

/** The SSE state of a film. Task 9's `useFilmEvents` writes it with `setQueryData(filmLiveKey(id), state)`. */
export function useFilmLive(id: string): LiveState {
  const { data } = useQuery({ queryKey: filmLiveKey(id), queryFn: (): LiveState => 'connecting', staleTime: Infinity, gcTime: Infinity })
  return data ?? 'connecting'
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const me = (await apiFetch('/v1/me', Me)).data
      setCsrfToken(me.csrf_token ?? null)
      return me
    },
  })
}

export const useWorkspace = () => useQuery({ queryKey: ['workspace'], queryFn: read('/v1/workspace', Workspace) })
export const useChannels = () => useQuery({ queryKey: ['channels'], queryFn: read(`/v1/channels?${PAGE}`, z.array(Channel)) })
export const useCharacters = () => useQuery({ queryKey: ['characters'], queryFn: read(`/v1/characters?${PAGE}`, z.array(Character)) })

export interface FilmFilter { status?: FilmStatus; channel_id?: string }
export function useFilms(filter: FilmFilter = {}) {
  const params = new URLSearchParams(PAGE)
  for (const [k, v] of Object.entries(filter)) if (v) params.set(k, v)
  return useQuery({ queryKey: ['films', filter], queryFn: read(`/v1/films?${params}`, z.array(FilmListItem)) })
}

/** Polls only while the event stream is offline; with a live stream the events refresh it. */
export function useFilm(id: string) {
  const live = useFilmLive(id)
  return useQuery({
    queryKey: ['film', id],
    queryFn: read(`/v1/films/${id}`, FilmDetail),
    refetchInterval: live === 'offline' ? FILM_POLL_MS : false,
  })
}

export const useVersions = (id: string) =>
  useQuery({ queryKey: ['film', id, 'versions'], queryFn: read(`/v1/films/${id}/versions`, z.array(Version)) })
export const useReviewQueue = () => useQuery({ queryKey: ['review-queue'], queryFn: read(`/v1/review-queue?${PAGE}`, z.array(ReviewItem)) })

export function useUsageToday() {
  const day = new Date().toISOString().slice(0, 10) // the API's days are UTC
  return useQuery({ queryKey: ['usage', day], queryFn: read(`/v1/usage?from=${day}&to=${day}`, Usage) })
}

export const useAssetUrl = (id: string | null) =>
  useQuery({ queryKey: ['asset-url', id], queryFn: read(`/v1/assets/${id}/url`, AssetUrl), enabled: id !== null, staleTime: ASSET_URL_STALE_MS })

/** A JSON asset (the timeline), fetched through its signed url and cached by asset id for good. */
export function useAssetJson<T>(id: string | null, schema: z.ZodType<T>) {
  return useQuery({
    queryKey: ['asset-json', id],
    enabled: id !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<T> => {
      const { url } = await read(`/v1/assets/${id}/url`, AssetUrl)()
      const res = await fetch(url, { credentials: 'same-origin' }).catch(() => { throw new ApiError(0, 'network', 'network error') })
      if (!res.ok) throw new ApiError(res.status, res.status === 404 ? 'not_found' : 'internal', 'asset not available')
      const parsed = schema.safeParse(await res.json().catch(() => undefined))
      if (!parsed.success) throw new ApiError(res.status, 'parse', 'asset does not match the expected shape', parsed.error.issues)
      return parsed.data
    },
  })
}

// ---- mutations: each invalidates the keys it changes ----

function useWrite<V, T>(mutationFn: (vars: V) => Promise<T>, keys: (vars: V) => QueryKey[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (_data, vars) => Promise.all(keys(vars).map((queryKey) => qc.invalidateQueries({ queryKey }))),
  })
}

const write = async <T>(path: string, schema: z.ZodType<T>, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown, headers?: Record<string, string>) =>
  (await apiFetch(path, schema, { method, body, headers })).data

const filmKeys = ({ id }: { id: string }): QueryKey[] => [['film', id], ['films'], ['review-queue']]
const filmAction = (id: string, action: string, body?: unknown) => write(`/v1/films/${id}/${action}`, FilmDetail, 'POST', body)

export interface NewFilm { channel_id: string; title: string; brief?: string; idempotencyKey?: string }
export const useCreateFilm = () =>
  useWrite(
    ({ idempotencyKey, ...body }: NewFilm) => write('/v1/films', Film, 'POST', body, { 'idempotency-key': idempotencyKey ?? crypto.randomUUID() }),
    () => [['films']],
  )

export const useCancelFilm = () => useWrite(({ id }: { id: string }) => filmAction(id, 'cancel'), filmKeys)
export const useRedoFilm = () =>
  useWrite(({ id, ...body }: { id: string; from_step: string; reason: string }) => filmAction(id, 'redo', body), filmKeys)
export const useEditScreenplay = () =>
  useWrite(({ id, screenplay }: { id: string; screenplay: unknown }) => write(`/v1/films/${id}/screenplay`, FilmDetail, 'PATCH', { screenplay }), filmKeys)

export type ReviewDecision =
  | { id: string; decision: 'approved'; reason?: string }
  | { id: string; decision: 'redo'; reason: string; redo_from_step?: string }
export const useReviewFilm = () =>
  useWrite(({ id, ...body }: ReviewDecision) => filmAction(id, 'review', body), filmKeys)

export interface CharacterInput { name: string; look: { ink: string; hair?: string }; voice_id: string; description?: string | null }
export const useSaveCharacter = () =>
  useWrite(
    ({ id, ...body }: { id?: string } & Partial<CharacterInput>) =>
      id ? write(`/v1/characters/${id}`, Character, 'PATCH', body) : write('/v1/characters', Character, 'POST', body),
    () => [['characters']],
  )
export const useArchiveCharacter = () =>
  useWrite(({ id }: { id: string }) => write(`/v1/characters/${id}`, Character, 'DELETE'), () => [['characters']])

export interface ChannelInput { display_name: string; locale: string; review_policy: 'manual' | 'auto_if_score'; auto_score_threshold: number | null }
export const useSaveChannel = () =>
  useWrite(
    ({ id, ...body }: { id?: string } & Partial<ChannelInput>) =>
      id ? write(`/v1/channels/${id}`, Channel, 'PATCH', body) : write('/v1/channels', Channel, 'POST', body),
    () => [['channels']],
  )

export interface WorkspaceInput { name?: string; max_cost_per_film_usd?: number | null; max_cost_per_day_usd?: number | null }
export const useSaveWorkspace = () =>
  useWrite((body: WorkspaceInput) => write('/v1/workspace', Workspace, 'PATCH', body), () => [['workspace'], ['me']])

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    meta: OWNS_UNAUTHORIZED,
    mutationFn: async (body: { email: string; password: string }) => (await apiFetch('/v1/auth/login', LoginResult, { method: 'POST', body })).data,
    onSuccess: async ({ csrf_token }) => {
      setCsrfToken(csrf_token)
      await qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

/** POST logout, then forget the csrf token and every cached query, then go to /login. */
export function useLogout() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => write('/v1/auth/logout', z.null(), 'POST'),
    onSuccess: () => {
      setCsrfToken(null)
      qc.clear()
      void navigate('/login', { replace: true })
    },
  })
}
