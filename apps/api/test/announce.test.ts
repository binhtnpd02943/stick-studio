import type { FastifyBaseLogger } from 'fastify'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ANNOUNCE_TIMEOUT_MS, announce } from '../src/announce.js'

afterEach(() => { vi.useRealTimers() })

describe('announce', () => {
  test('a publish that never settles is abandoned after the timeout and logged', async () => {
    vi.useFakeTimers()
    const error = vi.fn()
    const done = announce({ error } as unknown as FastifyBaseLogger, () => new Promise(() => {}), 'f1', 'cancelled')
    await vi.advanceTimersByTimeAsync(ANNOUNCE_TIMEOUT_MS)
    await done
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.objectContaining({ message: expect.stringMatching(/timed out/) }), filmId: 'f1' }), 'could not publish film event')
  })

  test('a publish that settles clears its timer', async () => {
    vi.useFakeTimers()
    await announce({ error: vi.fn() } as unknown as FastifyBaseLogger, async () => {}, 'f1', 'cancelled')
    expect(vi.getTimerCount()).toBe(0)
  })
})
