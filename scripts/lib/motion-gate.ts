import type { Timeline } from '@stick/core'
import { defaultCatalog, type Catalog } from '@stick/library'
import { checkMotion, type MotionFinding } from '@stick/render'
import { CliError } from './cli-error.js'

type Checker = (tl: Timeline, catalog: Catalog) => MotionFinding[]

/** Throws exit 3 with one line per finding unless `skip` is set or the film is clean. */
export function gateMotion(tl: Timeline, skip: boolean, check: Checker = checkMotion): void {
  if (skip) return
  const findings = check(tl, defaultCatalog)
  if (!findings.length) return
  const lines = findings.map((f) => `${f.kind} ${f.from.toFixed(2)}-${f.to.toFixed(2)}s ${f.note}`)
  throw new CliError(3, `${lines.join('\n')}\nmotion findings: film not rendered (use --skip-motion to override)`)
}
