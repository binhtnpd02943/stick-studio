import type { Timeline } from '@stick/core'
import type { Catalog } from '@stick/library'
import { checkMotion, type MotionFinding } from './motion.js'
import { checkPacing, type PacingFinding } from './pacing.js'

type Checker = (tl: Timeline, catalog: Catalog) => MotionFinding[]
type PacingChecker = (tl: Timeline) => PacingFinding[]

/** The motion and pacing gates' findings, one line each; empty when the film is clean. */
export function gateFindings(tl: Timeline, catalog: Catalog, check: Checker = checkMotion, pace: PacingChecker = checkPacing): string[] {
  return [
    ...check(tl, catalog).map((f) => `${f.kind} ${f.from.toFixed(2)}-${f.to.toFixed(2)}s ${f.note}`),
    ...pace(tl).map((f) => `pacing ${f.kind} ${f.start.toFixed(2)}-${f.end.toFixed(2)}s`),
  ]
}
