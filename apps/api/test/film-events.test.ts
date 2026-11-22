import type { FilmEvent } from '@stick/core'
import { redisPublisher } from '@stick/worker'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { inject } from 'vitest'
import { type EventHub, createEventHub } from '../src/events-hub.js'
import { type SseFrame, type TestApi, openSse, testApi } from './helpers.js'

let t: TestApi
let hub: EventHub
let publisher: ReturnType<typeof redisPublisher>
let base: string
beforeEach(async () => {
  hub = createEventHub(inject('redisUrl'))
  await hub.ready
  publisher = redisPublisher(inject('redisUrl'))
  t = await testApi({ subscribe: hub.subscribe, ssePingMs: 50 })
  base = await t.app.listen({ port: 0, host: '127.0.0.1' })
})
afterEach(async () => {
  await t.close()
  await publisher.close()
  await hub.close()
})

const open = (filmId: string) => openSse(`${base}/v1/films/${filmId}/events`, t.seeded.token)

async function newFilm(): Promise<string> {
  const res = await t.app.inject({ method: 'POST', url: '/v1/films', headers: { authorization: `Bearer ${t.seeded.token}` }, payload: { channel_id: t.seeded.channel.id, title: 'SSE' } })
  return res.json().data.id
}

const events = (frames: SseFrame[]) => frames.filter((f) => f.event)

describe('GET /v1/films/:id/events', () => {
  test('first event is a snapshot', async () => {
    const id = await newFilm()
    const s = await open(id)
    expect(s.res.status).toBe(200)
    expect(s.res.headers.get('content-type')).toBe('text/event-stream')
    expect(s.res.headers.get('cache-control')).toBe('no-cache')
    expect(s.res.headers.get('x-accel-buffering')).toBe('no')
    await s.until(() => events(s.frames).length > 0)
    const first = events(s.frames)[0]!
    expect(first.event).toBe('snapshot')
    expect(JSON.parse(first.data!)).toMatchObject({ film: { id, status: 'queued' }, version: { version: 1 }, steps: [], assets: [] })
    await s.close()
  })

  test('a published FilmEvent arrives as an SSE event', async () => {
    const id = await newFilm()
    const other = await newFilm()
    const s = await open(id)
    await s.until(() => events(s.frames).length > 0)
    const mine: FilmEvent = { type: 'film', filmId: id, status: 'running', at: new Date().toISOString() }
    await publisher.publish({ ...mine, filmId: other })
    await publisher.publish(mine)
    await s.until(() => events(s.frames).length > 1)
    expect(events(s.frames).slice(1)).toEqual([{ event: 'film', data: JSON.stringify(mine) }])
    await s.close()
  })

  test('sends a keep-alive comment', async () => {
    const s = await open(await newFilm())
    await s.until(() => s.frames.some((f) => f.comment === 'ping'))
    await s.close()
  })

  test('closing the client unsubscribes', async () => {
    const id = await newFilm()
    const a = await open(id)
    const b = await open(id)
    await a.until(() => events(a.frames).length > 0)
    await b.until(() => events(b.frames).length > 0)
    expect(hub.listenerCount(id)).toBe(2)
    await a.close()
    await a.until(() => hub.listenerCount(id) === 1)
    await b.close()
    await b.until(() => hub.listenerCount(id) === 0)
  })

  test('app.close ends open streams instead of hanging', async () => {
    const id = await newFilm()
    const s = await open(id)
    await s.until(() => events(s.frames).length > 0)
    await t.app.close()
    expect(hub.listenerCount(id)).toBe(0)
    await s.close()
  })
})
