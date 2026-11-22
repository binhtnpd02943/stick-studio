import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parseScreenplay, type Screenplay, type Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { solveTimeline, validateScreenplay } from '@stick/pipeline'
import { audioDurations, spokenBeatIds } from '@stick/render'
import { CliError } from './lib/cli-error.js'
import { gateMotion } from './lib/motion-gate.js'
import { renderWithAudio } from './lib/render-steps.js'

const USAGE = 'usage: npm run render -- <screenplay.json> [--durations d.json] [--audio dir] [--out out/film.mp4] [--skip-motion]'

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new CliError(1, `cannot read ${file}: ${(e as Error).message}`)
  }
}

function parseCli() {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        durations: { type: 'string' },
        audio: { type: 'string' },
        out: { type: 'string', default: 'out/film.mp4' },
        'skip-motion': { type: 'boolean', default: false },
      },
    })
    if (positionals.length !== 1) throw new Error('expected exactly one screenplay file')
    return { file: positionals[0]!, ...values, out: values.out!, skipMotion: values['skip-motion']! }
  } catch (e) {
    throw new CliError(1, `${(e as Error).message}\n${USAGE}`)
  }
}

/** A durations file is { "<beatId>": seconds > 0 }; anything else is an input error, not a silent NaN. */
function readDurations(file: string, sp: Screenplay): Record<string, number> {
  const raw = readJson(file)
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new CliError(1, `${file}: expected a JSON object of beat id to seconds`)
  const bad = Object.entries(raw).filter(([, v]) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
  if (bad.length) throw new CliError(1, `${file}: durations must be finite numbers > 0: ${bad.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`)
  const known = new Set(spokenBeatIds(sp))
  for (const k of Object.keys(raw)) if (!known.has(k)) console.error(`warning: ${file}: "${k}" matches no spoken beat id`)
  return raw as Record<string, number>
}

/** The audio helpers throw plain errors; the CLI keeps printing them unprefixed, as exit 1. */
function audioDurationsOrExit(sp: Screenplay, dir: string): Record<string, number> {
  try {
    return audioDurations(sp, dir)
  } catch (e) {
    throw new CliError(1, (e as Error).message)
  }
}

function buildTimeline(opts: ReturnType<typeof parseCli>): Timeline {
  const parsed = parseScreenplay(readJson(opts.file))
  if (!parsed.ok) throw new CliError(2, parsed.issues.map((i) => `schema ${i}`).join('\n'))
  const issues = validateScreenplay(parsed.value, defaultCatalog)
  if (issues.length) throw new CliError(2, issues.map((i) => `${i.code} ${i.path} ${i.message}`).join('\n'))
  const fromFile = opts.durations ? readDurations(opts.durations, parsed.value) : {}
  const fromAudio = opts.audio ? audioDurationsOrExit(parsed.value, opts.audio) : {}
  return solveTimeline(parsed.value, { ...fromFile, ...fromAudio }, defaultCatalog)
}

async function main(): Promise<void> {
  const opts = parseCli()
  const tl = buildTimeline(opts)
  gateMotion(tl, opts.skipMotion)
  const { frames, seconds } = await renderWithAudio(tl, opts.audio, opts.out)
  console.log(`out path: ${opts.out}`)
  console.log(`duration: ${tl.duration.toFixed(2)}s`)
  console.log(`frames: ${frames}`)
  console.log(`render fps: ${(frames / seconds).toFixed(1)}`)
}

main().catch((e: unknown) => {
  const exitCode = e instanceof CliError ? e.exitCode : 1
  const text = e instanceof CliError ? e.message : `error: ${e instanceof Error ? e.message : String(e)}`
  // Validation and motion findings are results (stdout); usage and IO errors go to stderr.
  ;(exitCode === 1 ? console.error : console.log)(text)
  process.exit(exitCode)
})
