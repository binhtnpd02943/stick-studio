import { FILM_STATUSES, FILM_STEPS, HAIR_STYLES, VOICE_IDS } from '@stick/core'
import { z } from 'zod/v4'

// Each schema mirrors an API `toWire` function. Timestamps are ISO strings, money is a number.
const iso = z.string()

export const Me = z.object({
  user: z.object({ id: z.string(), email: z.string(), name: z.string() }),
  workspace: z.object({ id: z.string(), name: z.string(), role: z.string() }),
  csrf_token: z.string().optional(),
})
export type Me = z.infer<typeof Me>

export const LoginResult = z.object({ csrf_token: z.string() })

export const Workspace = z.object({
  id: z.string(),
  name: z.string(),
  plan: z.string(),
  max_cost_per_film_usd: z.number().nullable(),
  max_cost_per_day_usd: z.number().nullable(),
  effective_max_cost_per_film_usd: z.number(),
  effective_max_cost_per_day_usd: z.number(),
})
export type Workspace = z.infer<typeof Workspace>

export const Channel = z.object({
  id: z.string(),
  platform: z.string(),
  display_name: z.string(),
  locale: z.string(),
  review_policy: z.enum(['manual', 'auto_if_score']),
  auto_score_threshold: z.number().nullable(),
  created_at: iso,
  updated_at: iso,
})
export type Channel = z.infer<typeof Channel>

export const Character = z.object({
  id: z.string(),
  name: z.string(),
  look: z.object({ ink: z.string(), hair: z.enum(HAIR_STYLES).optional() }).nullable(),
  voice_id: z.enum(VOICE_IDS).nullable(),
  description: z.string().nullable(),
  archived_at: iso.nullable(),
  created_at: iso,
  updated_at: iso,
})
export type Character = z.infer<typeof Character>

export const FilmStatus = z.enum(FILM_STATUSES)
export type FilmStatus = z.infer<typeof FilmStatus>
export const FilmStep = z.enum(FILM_STEPS)

export const Film = z.object({
  id: z.string(),
  channel_id: z.string(),
  topic_id: z.string().nullable(),
  source_type: z.string(),
  title: z.string(),
  brief: z.string().nullable(),
  status: FilmStatus,
  current_version: z.number(),
  cost_usd: z.number(),
  qa_score: z.number().nullable(),
  created_by: z.string(),
  created_at: iso,
  updated_at: iso,
})
export type Film = z.infer<typeof Film>

export const FilmListItem = Film.extend({ timeline_url: z.string().nullable() })
export type FilmListItem = z.infer<typeof FilmListItem>

export const Version = z.object({
  id: z.string(),
  version: z.number(),
  reason: z.string(),
  restart_from_step: FilmStep.nullable(),
  created_at: iso,
})
export type Version = z.infer<typeof Version>

export const StepRunStatus = z.enum(['running', 'succeeded', 'failed', 'skipped'])

export const FilmDetail = z.object({
  film: Film,
  version: Version,
  steps: z.array(z.object({
    step: FilmStep,
    status: StepRunStatus,
    attempt: z.number(),
    error: z.unknown().nullable(),
    started_at: iso.nullable(),
    finished_at: iso.nullable(),
  })),
  assets: z.array(z.object({
    id: z.string(),
    kind: z.string(),
    path: z.string().nullable(),
    mime: z.string().nullable(),
    bytes: z.number().nullable(),
  })),
})
export type FilmDetail = z.infer<typeof FilmDetail>

export const ReviewItem = z.object({
  film: z.object({ id: z.string(), title: z.string(), status: FilmStatus, cost_usd: z.number(), current_version: z.number() }),
  final_asset_id: z.string().nullable(),
  final_url: z.string().nullable(),
  contact_asset_id: z.string().nullable(),
  timeline_url: z.string().nullable(),
  findings: z.unknown().nullable(),
})
export type ReviewItem = z.infer<typeof ReviewItem>

export const Usage = z.object({
  from: z.string(),
  to: z.string(),
  total_usd: z.number(),
  by_day: z.array(z.object({ day: z.string(), cost_usd: z.number() })),
  by_provider: z.array(z.object({ provider: z.string(), model: z.string().nullable(), cost_usd: z.number() })),
  by_film: z.array(z.object({ film_id: z.string(), title: z.string(), cost_usd: z.number() })),
})
export type Usage = z.infer<typeof Usage>

export const AssetUrl = z.object({ url: z.string(), expires_at: iso })
export type AssetUrl = z.infer<typeof AssetUrl>

export const FilmEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('step'), filmId: z.string(), versionId: z.string(), step: FilmStep, status: StepRunStatus, attempt: z.number(), at: iso }),
  z.object({ type: z.literal('film'), filmId: z.string(), status: FilmStatus, at: iso }),
])
export type FilmEvent = z.infer<typeof FilmEvent>
