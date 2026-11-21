import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseScreenplay, type Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { solveTimeline, validateScreenplay } from '@stick/pipeline'
import { checkMotion, muxAudio, renderVideo } from '@stick/render'
import { audioClips, audioDurations } from './lib/audio-clips.js'

const USAGE = 'usage: npm run render -- <screenplay.json> [--durations d.json] [--audio dir] [--out out/film.mp4] [--skip-motion]'

class CliError extends Error {
  constructor(
    readonly exitCode: 1 | 2 | 3,
    message: string,
  ) {
    super(message)
  }
}

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

function buildTimeline(opts: ReturnType<typeof parseCli>): Timeline {
  const parsed = parseScreenplay(readJson(opts.file))
  if (!parsed.ok) throw new CliError(2, parsed.issues.map((i) => `schema ${i}`).join('\n'))
  const issues = validateScreenplay(parsed.value, defaultCatalog)
  if (issues.length) throw new CliError(2, issues.map((i) => `${i.code} ${i.path} ${i.message}`).join('\n'))
  const fromFile = opts.durations ? (readJson(opts.durations) as Record<string, number>) : {}
  const fromAudio = opts.audio ? audioDurations(parsed.value, opts.audio) : {}
  return solveTimeline(parsed.value, { ...fromFile, ...fromAudio }, defaultCatalog)
}

function gateMotion(tl: Timeline, skip: boolean): void {
  if (skip) return
  const findings = checkMotion(tl, defaultCatalog)
  if (!findings.length) return
  const lines = findings.map((f) => `${f.kind} ${f.from.toFixed(2)}-${f.to.toFixed(2)}s ${f.note}`)
  throw new CliError(3, `${lines.join('\n')}\nmotion findings: film not rendered (use --skip-motion to override)`)
}

async function render(tl: Timeline, opts: ReturnType<typeof parseCli>): Promise<{ frames: number; seconds: number }> {
  mkdirSync(dirname(opts.out), { recursive: true })
  if (!opts.audio) return renderVideo(tl, opts.out)
  const tmp = mkdtempSync(join(tmpdir(), 'stick-render-'))
  try {
    const silent = join(tmp, 'silent.mp4')
    const stats = await renderVideo(tl, silent)
    await muxAudio(silent, audioClips(tl, opts.audio), opts.out)
    return stats
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const opts = parseCli()
  const tl = buildTimeline(opts)
  gateMotion(tl, opts.skipMotion)
  const { frames, seconds } = await render(tl, opts)
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
