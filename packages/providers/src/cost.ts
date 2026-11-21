import type { LlmUsage } from '@stick/core'

/** USD per million tokens. */
const PRICES: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  fake: { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 },
}

export function costUsd(u: LlmUsage): number {
  const p = PRICES[u.model]
  if (!p) throw new Error(`no price known for model "${u.model}"`)
  return (u.inputTokens * p.input + u.outputTokens * p.output + u.cacheWriteTokens * p.cacheWrite + u.cacheReadTokens * p.cacheRead) / 1e6
}
