import { GateFailedError } from '@stick/pipeline'

export class BudgetExceededError extends Error {
  constructor(readonly scope: 'film' | 'day', readonly spentUsd: number, readonly capUsd: number) {
    super(`${scope} budget reached: spent $${spentUsd} of $${capUsd}`)
    this.name = 'BudgetExceededError'
  }
}

/** Thrown so the queue retries the job; `cause` is the original error. */
export class TransientStepError extends Error {
  constructor(cause: unknown) {
    super(`transient: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    this.name = 'TransientStepError'
  }
}

export type ErrorClass = 'transient' | 'budget' | 'gate' | 'logic'

const TRANSIENT_ERRNOS = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'])
// Matched by name (the SDK sets it on every error) so the worker need not depend on @anthropic-ai/sdk.
const TRANSIENT_NAMES = new Set(['APIConnectionError', 'APIConnectionTimeoutError'])
const RATE_LIMITED = 429
const SERVER_ERROR = 500

export function classify(e: unknown): ErrorClass {
  if (e instanceof BudgetExceededError) return 'budget'
  if (e instanceof GateFailedError) return 'gate'
  if (typeof e !== 'object' || e === null) return 'logic'
  const { status, code, name } = e as { status?: unknown; code?: unknown; name?: unknown }
  if (typeof status === 'number' && (status === RATE_LIMITED || status >= SERVER_ERROR)) return 'transient'
  if (typeof code === 'string' && TRANSIENT_ERRNOS.has(code)) return 'transient'
  if (typeof name === 'string' && TRANSIENT_NAMES.has(name)) return 'transient'
  return 'logic'
}
