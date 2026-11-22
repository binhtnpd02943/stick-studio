import type { FilmStep } from '@stick/core'
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm'
import type { Db } from '../client.js'
import { NotFoundError } from '../errors.js'
import { filmVersions, films, usageEvents } from '../schema.js'

export type UsageEvent = Omit<typeof usageEvents.$inferSelect, 'costUsd'> & { costUsd: number }

const DAY_MS = 86_400_000

export interface UsageInput {
  filmId: string
  filmVersionId: string
  step: FilmStep
  provider: string
  model: string
  units: unknown
  costUsd: number
}

/** Books one paid call: the event and `films.cost_usd += cost` commit together, and the increment is done in SQL so concurrent bookings add up. */
export async function bookUsage(db: Db, workspaceId: string, input: UsageInput): Promise<UsageEvent> {
  // Postgres numeric accepts 'NaN', which would poison every sum and silently disable both budget caps.
  if (!Number.isFinite(input.costUsd) || input.costUsd < 0) throw new Error(`invalid usage cost: ${input.costUsd} (must be finite and not negative)`)
  const cost = String(input.costUsd)
  return db.transaction(async (tx) => {
    const updated = await tx.update(films)
      .set({ costUsd: sql`${films.costUsd} + ${cost}::numeric` })
      .where(and(eq(films.workspaceId, workspaceId), eq(films.id, input.filmId)))
      .returning({ id: films.id })
    if (updated.length === 0) throw new NotFoundError('film not found')
    const [row] = await tx.insert(usageEvents).values({
      workspaceId,
      filmVersionId: input.filmVersionId,
      step: input.step,
      provider: input.provider,
      model: input.model,
      units: input.units,
      costUsd: cost,
    }).returning()
    return { ...row!, costUsd: Number(row!.costUsd) }
  })
}

const total = sql<string>`coalesce(sum(${usageEvents.costUsd}), 0)`
const inRange = (workspaceId: string, from: Date, to: Date) =>
  and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, from), lt(usageEvents.createdAt, to))

/** Spend over the UTC day that contains `day`. */
export async function spentOnDay(db: Db, workspaceId: string, day: Date): Promise<number> {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  const [row] = await db.select({ total }).from(usageEvents).where(inRange(workspaceId, start, new Date(start.getTime() + DAY_MS)))
  return Number(row!.total)
}

export interface UsageSummary {
  totalUsd: number
  byDay: { day: string; costUsd: number }[]
  byProvider: { provider: string; model: string | null; costUsd: number }[]
  byFilm: { filmId: string; title: string; costUsd: number }[]
}

/** Usage in `[from, to)`; days are UTC dates as `YYYY-MM-DD`. */
export async function usageSummary(db: Db, workspaceId: string, range: { from: Date; to: Date }): Promise<UsageSummary> {
  const where = inRange(workspaceId, range.from, range.to)
  const day = sql<string>`to_char(${usageEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const [sum, byDay, byProvider, byFilm] = await Promise.all([
    db.select({ total }).from(usageEvents).where(where),
    db.select({ day, total }).from(usageEvents).where(where).groupBy(day).orderBy(asc(day)),
    db.select({ provider: usageEvents.provider, model: usageEvents.model, total }).from(usageEvents).where(where)
      .groupBy(usageEvents.provider, usageEvents.model),
    db.select({ filmId: films.id, title: films.title, total }).from(usageEvents)
      .innerJoin(filmVersions, eq(filmVersions.id, usageEvents.filmVersionId))
      .innerJoin(films, eq(films.id, filmVersions.filmId))
      .where(where)
      .groupBy(films.id, films.title),
  ])
  return {
    totalUsd: Number(sum[0]!.total),
    byDay: byDay.map((r) => ({ day: r.day, costUsd: Number(r.total) })),
    byProvider: byProvider.map((r) => ({ provider: r.provider, model: r.model, costUsd: Number(r.total) })),
    byFilm: byFilm.map((r) => ({ filmId: r.filmId, title: r.title, costUsd: Number(r.total) })),
  }
}
