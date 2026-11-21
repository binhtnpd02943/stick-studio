import { describe, expect, it } from 'vitest'
import { costUsd } from '../src/index.js'

const u = (over = {}) => ({ model: 'claude-sonnet-5-5', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, ...over })

describe('costUsd', () => {
  it('prices 1M input + 1M output at 12 USD', () => {
    expect(costUsd(u({ inputTokens: 1e6, outputTokens: 1e6 }))).toBe(12)
  })
  it('prices cache write 2.50 and cache read 0.20 per MTok', () => {
    expect(costUsd(u({ cacheWriteTokens: 1e6 }))).toBe(2.5)
    expect(costUsd(u({ cacheReadTokens: 1e6 }))).toBeCloseTo(0.2, 10)
  })
  it('throws for an unknown model', () => {
    expect(() => costUsd(u({ model: 'claude-mystery' }))).toThrow(/claude-mystery/)
  })
  it('costs the fake model at zero so offline runs are free', () => {
    expect(costUsd(u({ model: 'fake', inputTokens: 5 }))).toBe(0)
  })
})
