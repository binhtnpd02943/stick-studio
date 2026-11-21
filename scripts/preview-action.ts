import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { MARK_RE } from '@stick/core'
import { defaultCatalog, lookup } from '@stick/library'
import { renderContactSheet, soloTimeline, STAGE } from '@stick/render'
import { CliError } from './lib/cli-error.js'

// Crop to the figure's band: the frame above 690 px over the ground is blank, and the rest is where poses live.
const PREVIEW = { crop: { x: 0, y: STAGE.groundY - 690, w: 1080, h: 740 }, cols: 3, rows: 4, scale: 0.4 }

const USAGE = 'usage: npm run preview -- <actionId> [--target left|center|right|near:<prop>] [--dur seconds] [--prop <type>]'

function parseCli() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { target: { type: 'string' }, dur: { type: 'string' }, prop: { type: 'string' } },
    })
    if (positionals.length !== 1) throw new Error('expected exactly one action id')
    return { id: positionals[0]!, ...values }
  } catch (e) {
    throw new CliError(1, `${(e as Error).message}\n${USAGE}`)
  }
}

async function main(): Promise<void> {
  const { id, target, dur, prop } = parseCli()
  const action = lookup(defaultCatalog.actions, id)
  if (!action) throw new CliError(1, `unknown action "${id}"; known: ${Object.keys(defaultCatalog.actions).join(', ')}`)
  if (target !== undefined && !MARK_RE.test(target)) throw new CliError(1, `--target must be left, center, right or near:<prop>\n${USAGE}`)
  if (prop !== undefined && !lookup(defaultCatalog.props, prop)) throw new CliError(1, `unknown prop "${prop}"; known: ${Object.keys(defaultCatalog.props).join(', ')}`)
  if (target?.startsWith('near:') && target.slice(5) !== prop) throw new CliError(1, `--target ${target} needs --prop ${target.slice(5)} (the prop's id is its type)\n${USAGE}`)
  const seconds = dur === undefined ? action.duration.ideal : Number(dur)
  if (!Number.isFinite(seconds) || seconds <= 0) throw new CliError(1, `--dur must be a number > 0\n${USAGE}`)

  const out = join('out', 'preview', `${id}.png`)
  mkdirSync(join('out', 'preview'), { recursive: true })
  await renderContactSheet(soloTimeline(id, seconds, target ?? (action.needsTarget ? 'right' : undefined), prop), out, PREVIEW)
  console.log(`out path: ${out}`)
  console.log(`duration: ${seconds.toFixed(2)}s`)
}

main().catch((e: unknown) => {
  const exitCode = e instanceof CliError ? e.exitCode : 1
  console.error(e instanceof CliError ? e.message : `error: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(exitCode)
})
