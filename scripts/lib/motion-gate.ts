import type { Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { checkMotion, checkPacing, gateFindings } from '@stick/render'
import { CliError } from './cli-error.js'

/** The exit-3 text for gate findings, shared with make's GateFailedError mapping. */
export const gateFailureText = (lines: string[]): string => `${lines.join('\n')}\nmotion/pacing findings: film not rendered (use --skip-motion to override)`

/** Runs the motion and pacing gates; throws exit 3 with one line per finding unless `skip` is set or the film is clean. */
export function gateMotion(tl: Timeline, skip: boolean, check = checkMotion, pace = checkPacing): void {
  if (skip) return
  const lines = gateFindings(tl, defaultCatalog, check, pace)
  if (lines.length) throw new CliError(3, gateFailureText(lines))
}
