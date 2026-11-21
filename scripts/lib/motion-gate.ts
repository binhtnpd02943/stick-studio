import type { Timeline } from '@stick/core'
import { defaultCatalog, type Catalog } from '@stick/library'
import { checkMotion, checkPacing, type MotionFinding, type PacingFinding } from '@stick/render'
import { CliError } from './cli-error.js'

type Checker = (tl: Timeline, catalog: Catalog) => MotionFinding[]
type PacingChecker = (tl: Timeline) => PacingFinding[]

/** Runs the motion and pacing gates; throws exit 3 with one line per finding unless `skip` is set or the film is clean. */
export function gateMotion(tl: Timeline, skip: boolean, check: Checker = checkMotion, pace: PacingChecker = checkPacing): void {
  if (skip) return
  const lines = [
    ...check(tl, defaultCatalog).map((f) => `${f.kind} ${f.from.toFixed(2)}-${f.to.toFixed(2)}s ${f.note}`),
    ...pace(tl).map((f) => `pacing ${f.kind} ${f.start.toFixed(2)}-${f.end.toFixed(2)}s`),
  ]
  if (!lines.length) return
  throw new CliError(3, `${lines.join('\n')}\nmotion/pacing findings: film not rendered (use --skip-motion to override)`)
}
