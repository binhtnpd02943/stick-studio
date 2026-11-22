import { createHash } from 'node:crypto'
import type { FilmStep } from '@stick/core'

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** SHA-256 of canonical JSON: inputs sorted by path, params by key, so equal inputs always hash the same. */
export function inputHash(step: FilmStep, version: string, inputs: { path: string; sha256: string }[], params: Record<string, string>): string {
  const canonical = {
    step,
    version,
    inputs: [...inputs].sort((a, b) => byKey(a.path, b.path)).map(({ path, sha256 }) => ({ path, sha256 })),
    params: Object.fromEntries(Object.entries(params).sort(([a], [b]) => byKey(a, b))),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
