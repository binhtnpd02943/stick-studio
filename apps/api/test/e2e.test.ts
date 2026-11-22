import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FILM_STEPS, type FilmEvent } from '@stick/core'
import { usageEvents } from '@stick/db'
import { createQueues, enqueueStep, startWorker } from '@stick/worker'
import { eq } from 'drizzle-orm'
import pino from 'pino'
import { afterAll, beforeAll, expect, inject, test } from 'vitest'
import { type EventHub, createEventHub } from '../src/events-hub.js'
import { type TestApi, openSse, testApi } from './helpers.js'

const redisUrl = inject('redisUrl')
const prefix = `e2e-${process.pid}-${Date.now()}`
const POLL_MS = 500
const TIMEOUT_MS = 280_000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let t: TestApi
let hub: EventHub
let queues: ReturnType<typeof createQueues>
let worker: Awaited<ReturnType<typeof startWorker>> | undefined
let base: string
beforeAll(async () => {
  hub = createEventHub(redisUrl)
  await hub.ready
  queues = createQueues(redisUrl, { prefix })
  t = await testApi({ subscribe: hub.subscribe, enqueue: (job) => enqueueStep(queues, job) })
  base = await t.app.listen({ port: 0, host: '127.0.0.1' })
})
afterAll(async () => {
  await worker?.close()
  await t.close()
  await queues.close()
  await hub.close()
})

/** A bearer request to the listening app; a 429 from the shared 120/min limit is waited out, since the poll alone spends most of it. */
async function api(path: string, init: RequestInit = {}): Promise<Response> {
  for (;;) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${t.seeded.token}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    })
    if (res.status !== 429) return res
    await sleep(Number(res.headers.get('retry-after') ?? 1) * 1000)
  }
}
const json = async (path: string, init?: RequestInit) => (await (await api(path, init)).json()).data

test('api creates a film, the worker makes it with fakes, the owner approves it', async () => {
  const created = await api('/v1/films', {
    method: 'POST',
    headers: { 'idempotency-key': `e2e-${prefix}` },
    body: JSON.stringify({ channel_id: t.seeded.channel.id, title: 'Phân số là gì?' }),
  })
  expect(created.status).toBe(201)
  const filmId: string = (await created.json()).data.id

  // The worker starts only after the snapshot, so no event is published before the stream listens.
  const sse = await openSse(`${base}/v1/films/${filmId}/events`, t.seeded.token)
  await sse.until(() => sse.frames.some((f) => f.event === 'snapshot'))
  worker = await startWorker({ db: t.db, storage: t.storage, cfg: t.cfg, log: pino({ level: 'silent' }) }, { redisUrl, prefix })

  let detail = await json(`/v1/films/${filmId}`)
  for (const deadline = Date.now() + TIMEOUT_MS; detail.film.status !== 'awaiting_review'; detail = await json(`/v1/films/${filmId}`)) {
    expect(['queued', 'running']).toContain(detail.film.status)
    if (Date.now() > deadline) throw new Error(`film still ${detail.film.status} after ${TIMEOUT_MS} ms`)
    await sleep(POLL_MS)
  }

  const succeeded = detail.steps.filter((s: { status: string }) => s.status === 'succeeded').map((s: { step: string }) => s.step)
  expect([...succeeded].sort()).toEqual([...FILM_STEPS].sort())
  const assetOf = (kind: string) => detail.assets.find((a: { kind: string }) => a.kind === kind)
  expect(assetOf('contact_sheet')).toBeDefined()
  const final = assetOf('final')
  expect(final).toBeDefined()

  const download = async (assetId: string) => fetch(`${base}${(await json(`/v1/assets/${assetId}/url`)).url}`)
  const mp4 = await download(final.id)
  expect(mp4.status).toBe(200)
  expect(mp4.headers.get('content-type')).toBe('video/mp4')
  const file = join(t.cfg.cacheDir, 'e2e-final.mp4')
  writeFileSync(file, Buffer.from(await mp4.arrayBuffer()))
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  const probed = JSON.parse(probe.stdout) as { streams: { width: number; height: number }[]; format: { duration: string } }
  expect(probed.streams[0]).toEqual({ width: 1080, height: 1920 })
  const timeline = (await (await download(assetOf('timeline').id)).json()) as { duration: number }
  expect(Math.abs(Number(probed.format.duration) - timeline.duration)).toBeLessThanOrEqual(0.1)

  // The poll can see awaiting_review just before its event arrives.
  const isDone = (f: { event?: string; data?: string }) => f.event === 'film' && (JSON.parse(f.data!) as FilmEvent & { type: 'film' }).status === 'awaiting_review'
  await sse.until(() => sse.frames.some(isDone))
  await sse.close()
  const labels = sse.frames.filter((f) => f.event === 'step' || f.event === 'film').map((f) => {
    const e = JSON.parse(f.data!) as FilmEvent
    return e.type === 'step' ? `step ${e.step} ${e.status}` : `film ${e.status}`
  })
  expect(labels.filter((l) => l.endsWith(' succeeded') || l === 'film awaiting_review'))
    .toEqual([...FILM_STEPS.map((s) => `step ${s} succeeded`), 'film awaiting_review'])
  expect(labels.at(-1)).toBe('film awaiting_review')

  const queue = await json('/v1/review-queue')
  expect(queue.map((i: { film: { id: string } }) => i.film.id)).toContain(filmId)

  const review = await api(`/v1/films/${filmId}/review`, { method: 'POST', body: JSON.stringify({ decision: 'approved' }) })
  expect(review.status).toBe(200)
  const approved = await json(`/v1/films/${filmId}`)
  expect(approved.film.status).toBe('approved')
  expect(approved.film.cost_usd).toBe(0)
  const usage = await t.db.select().from(usageEvents).where(eq(usageEvents.workspaceId, t.seeded.workspace.id))
  expect(usage.filter((u) => u.step === 'voice').length).toBeGreaterThan(0)
  expect(usage.every((u) => Number(u.costUsd) === 0)).toBe(true)
})
