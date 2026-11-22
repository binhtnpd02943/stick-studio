import type { FilmEvent } from '@stick/core'
import { redisPublisher } from '@stick/worker'
import { afterEach, beforeEach, describe, expect, inject, test, vi } from 'vitest'
import { type EventHub, createEventHub } from '../src/events-hub.js'

const event: FilmEvent = { type: 'film', filmId: 'f-hub', status: 'cancelled', at: '2026-01-01T00:00:00.000Z' }
const until = async (pred: () => boolean, ms = 5000) => {
  const end = Date.now() + ms
  while (!pred()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

let hub: EventHub
let publisher: ReturnType<typeof redisPublisher>
const onError = vi.fn()
beforeEach(async () => {
  onError.mockClear()
  hub = createEventHub(inject('redisUrl'), onError)
  await hub.ready
  publisher = redisPublisher(inject('redisUrl'))
})
afterEach(async () => {
  await publisher.close()
  await hub.close()
})

describe('event hub', () => {
  test('one throwing subscriber does not stop the others', async () => {
    const boom = new Error('subscriber A failed')
    const b = vi.fn()
    hub.subscribe(event.filmId, () => { throw boom })
    hub.subscribe(event.filmId, b)
    await publisher.publish(event)
    await until(() => b.mock.calls.length > 0)
    expect(b).toHaveBeenCalledWith(event)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(boom)
  })
})
