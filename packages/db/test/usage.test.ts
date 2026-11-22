import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type Db, bookUsage, createFilm, getFilm, spentOnDay, usageEvents, usageSummary } from '../src/index.js'
import { createTestDb, seedWorkspace } from '../src/testing.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

async function newFilm(title = 'F') {
  const s = await seedWorkspace(db)
  const { film, version } = await createFilm(db, s.workspace.id, { channelId: s.channel.id, title, createdBy: s.user.id })
  return { ...s, ws: s.workspace.id, film, version }
}

const booking = (filmId: string, filmVersionId: string, costUsd: number, provider = 'fake', model = 'm') =>
  ({ filmId, filmVersionId, step: 'story' as const, provider, model, units: { input: 1, output: 2 }, costUsd })

describe('usage', () => {
  test('bookUsage adds to films.cost_usd atomically', async () => {
    const { ws, film, version } = await newFilm()
    await Promise.all(Array.from({ length: 10 }, () => bookUsage(db, ws, booking(film.id, version.id, 0.1))))
    expect((await getFilm(db, ws, film.id))?.costUsd).toBe(1)
    expect(await spentOnDay(db, ws, new Date())).toBe(1)
  })

  test('bookUsage on another workspace film books nothing', async () => {
    const a = await newFilm()
    const b = await newFilm()
    await expect(bookUsage(db, b.ws, booking(a.film.id, a.version.id, 0.5))).rejects.toThrow()
    expect((await getFilm(db, a.ws, a.film.id))?.costUsd).toBe(0)
    expect(await spentOnDay(db, b.ws, new Date())).toBe(0)
  })

  test('spentOnDay counts only that UTC day', async () => {
    const { ws, version } = await newFilm()
    const other = await newFilm()
    const at = (iso: string, costUsd: string, workspaceId = ws) =>
      ({ workspaceId, filmVersionId: version.id, provider: 'fake', costUsd, createdAt: new Date(iso) })
    await db.insert(usageEvents).values([
      at('2026-03-09T23:59:59.999Z', '1'),
      at('2026-03-10T00:00:00.000Z', '0.25'),
      at('2026-03-10T23:59:59.999Z', '0.5'),
      at('2026-03-11T00:00:00.000Z', '2'),
      at('2026-03-10T12:00:00.000Z', '9', other.ws),
    ])
    // a local-evening timestamp still names the UTC day it falls in
    expect(await spentOnDay(db, ws, new Date('2026-03-10T05:00:00Z'))).toBe(0.75)
    expect(await spentOnDay(db, ws, new Date('2026-03-12T00:00:00Z'))).toBe(0)
  })

  test('usageSummary groups by day, provider and film', async () => {
    const a = await newFilm('Alpha')
    const ws = a.ws
    const { film: beta, version: betaV } = await createFilm(db, ws, { channelId: a.channel.id, title: 'Beta', createdBy: a.user.id })
    const ev = (filmVersionId: string, provider: string, model: string, costUsd: string, iso: string) =>
      ({ workspaceId: ws, filmVersionId, provider, model, costUsd, createdAt: new Date(iso) })
    await db.insert(usageEvents).values([
      ev(a.version.id, 'anthropic', 'sonnet', '0.1', '2026-04-01T10:00:00Z'),
      ev(a.version.id, 'tts', 'v1', '0.2', '2026-04-01T23:00:00Z'),
      ev(betaV.id, 'anthropic', 'sonnet', '0.3', '2026-04-02T01:00:00Z'),
      ev(betaV.id, 'anthropic', 'sonnet', '5', '2026-04-05T01:00:00Z'), // outside the range
    ])
    const s = await usageSummary(db, ws, { from: new Date('2026-04-01T00:00:00Z'), to: new Date('2026-04-03T00:00:00Z') })
    expect(s.totalUsd).toBeCloseTo(0.6, 6)
    expect(s.byDay).toEqual([{ day: '2026-04-01', costUsd: 0.3 }, { day: '2026-04-02', costUsd: 0.3 }])
    expect(s.byProvider).toEqual(expect.arrayContaining([
      { provider: 'anthropic', model: 'sonnet', costUsd: 0.4 }, { provider: 'tts', model: 'v1', costUsd: 0.2 },
    ]))
    expect(s.byProvider).toHaveLength(2)
    expect(s.byFilm).toEqual(expect.arrayContaining([
      { filmId: a.film.id, title: 'Alpha', costUsd: 0.3 }, { filmId: beta.id, title: 'Beta', costUsd: 0.3 },
    ]))
    expect(s.byFilm).toHaveLength(2)
    const empty = await usageSummary(db, ws, { from: new Date('2020-01-01Z'), to: new Date('2020-01-02Z') })
    expect(empty).toEqual({ totalUsd: 0, byDay: [], byProvider: [], byFilm: [] })
  })
})
