import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { AudioClip } from './audio.js'
import { killAndWait, runFfmpeg } from './ffmpeg.js'

const SFX_DB = -14
const MUSIC_DB = -22
const DUCK = 'sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300'
const LOUDNORM = 'loudnorm=I=-14:TP=-1.5:LRA=11'
const LOUDNORM_KEYS = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'] as const
const RATE = 48000
const LOUDNESS_TIMEOUT_MS = 120_000
const STDERR_TAIL_LINES = 10
const MONO = `aformat=sample_fmts=fltp:sample_rates=${RATE}:channel_layouts=mono`

export interface FilmAudio {
  voice: AudioClip[]
  sfx: AudioClip[]
  /** Background music, already licence-checked by the caller; trimmed to the video, never looped. */
  music?: string
}

const execFileP = promisify(execFile)

async function videoSeconds(videoPath: string, ffprobePath: string): Promise<number> {
  const { stdout } = await execFileP(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath])
  const s = Number(stdout.trim())
  if (!Number.isFinite(s) || s <= 0) throw new Error(`mixFilm: cannot read duration of ${videoPath}`)
  return s
}

/**
 * Single-pass loudnorm is dynamic and lands several LU off on sparse or steady material, so the mix is measured first and
 * then normalised with those measurements (linear when the material allows). Silence has nothing to measure: plain loudnorm.
 */
async function loudnormFor(ffmpegPath: string, videoPath: string, files: string[], graph: (norm: string) => string, timeoutMs: number): Promise<string> {
  const args = ['-hide_banner', '-nostats', '-i', videoPath, ...files.flatMap((f) => ['-i', f]), '-filter_complex', graph(`${LOUDNORM}:print_format=json`), '-map', '[aout]', '-f', 'null', '-']
  let stderr: string
  try {
    ;({ stderr } = await execFileP(ffmpegPath, args, { maxBuffer: 1 << 24, timeout: timeoutMs, killSignal: 'SIGKILL' }))
  } catch (e) {
    // Rethrown as a fresh Error: execFile's own message embeds the whole command line, filtergraph included.
    const err = e as NodeJS.ErrnoException & { killed?: boolean; code?: number | string; stderr?: string }
    if (err.killed) throw new Error(`mixFilm: loudness pass timed out after ${timeoutMs} ms`)
    throw new Error(`mixFilm: loudness pass failed (exit ${err.code})\n${String(err.stderr ?? '').trimEnd().split('\n').slice(-STDERR_TAIL_LINES).join('\n')}`)
  }
  const json = stderr.match(/\{[^{}]*\}/g)?.at(-1)
  if (!json) throw new Error(`mixFilm: no loudness measurement in ffmpeg output\n${stderr.split('\n').slice(-10).join('\n')}`)
  const m = JSON.parse(json) as Record<(typeof LOUDNORM_KEYS)[number], string>
  if (!LOUDNORM_KEYS.every((k) => Number.isFinite(Number(m[k])))) return LOUDNORM
  return `${LOUDNORM}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
}

/** One mono 48 kHz bus label from `clips`: each distinct file is read once and split per use, each use delayed to its start. */
function bus(clips: AudioClip[], inputOf: (path: string) => number, name: string, gainDb: number, out: string[]): string | undefined {
  if (clips.length === 0) return undefined
  const uses = new Map<string, number>()
  for (const c of clips) uses.set(c.path, (uses.get(c.path) ?? 0) + 1)
  const taps = new Map<string, string[]>()
  for (const [path, n] of uses) {
    const i = inputOf(path)
    if (n === 1) taps.set(path, [`${i}:a`])
    else {
      const labels = Array.from({ length: n }, (_, k) => `${name}s${i}_${k}`)
      out.push(`[${i}:a]asplit=${n}${labels.map((l) => `[${l}]`).join('')}`)
      taps.set(path, labels)
    }
  }
  const delayed = clips.map((c, k) => {
    const src = taps.get(c.path)!.shift()!
    out.push(`[${src}]${MONO},adelay=${Math.round(c.start * 1000)}:all=1[${name}${k}]`)
    return `[${name}${k}]`
  })
  out.push(`${delayed.join('')}amix=inputs=${clips.length}:normalize=0,volume=${gainDb}dB[${name}]`)
  return name
}

/**
 * Mixes voice (0 dB), SFX (-14 dB) and optional music (-22 dB, ducked under the voice) onto `videoPath`, loudness-normalised
 * to -14 LUFS, AAC 160k 48 kHz. The audio is exactly as long as the video: a silent anchor of that length leads the mix, so
 * short audio is padded and long music cut.
 */
export async function mixFilm(
  videoPath: string,
  audio: FilmAudio,
  outPath: string,
  opts: { ffmpegPath?: string; ffprobePath?: string; loudnessTimeoutMs?: number } = {},
): Promise<void> {
  // Checked first: the failure path below deletes outPath, which would delete the source.
  if (resolve(outPath) === resolve(videoPath)) throw new Error('mixFilm: outPath must differ from videoPath')
  const { ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe', loudnessTimeoutMs = LOUDNESS_TIMEOUT_MS } = opts
  const seconds = await videoSeconds(videoPath, ffprobePath)
  const files: string[] = []
  const inputOf = (path: string): number => {
    const known = files.indexOf(path)
    if (known >= 0) return known + 1
    files.push(path)
    return files.length // input 0 is the video
  }
  const g: string[] = [`anullsrc=r=${RATE}:cl=mono,atrim=0:${seconds}[anchor]`]
  const voice = bus(audio.voice, inputOf, 'voice', 0, g)
  const sfx = bus(audio.sfx, inputOf, 'sfx', SFX_DB, g)
  const music = audio.music === undefined ? undefined : inputOf(audio.music)
  const parts = ['anchor']
  if (voice) {
    parts.push('vmix')
    // apad: sidechaincompress stops when its sidechain ends, which would cut the music after the last line.
    g.push(music !== undefined ? `[voice]asplit=2[vmix][vraw];[vraw]apad[vsc]` : `[voice]anull[vmix]`)
  }
  if (sfx) parts.push(sfx)
  if (music !== undefined) {
    g.push(`[${music}:a]${MONO},volume=${MUSIC_DB}dB[m]`)
    g.push(voice ? `[m][vsc]${DUCK}[mduck]` : `[m]anull[mduck]`)
    parts.push('mduck')
  }
  const graph = (norm: string) => [...g, `${parts.map((p) => `[${p}]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=first,${norm},aresample=${RATE}[aout]`].join(';')
  const norm = await loudnormFor(ffmpegPath, videoPath, files, graph, loudnessTimeoutMs)
  const args = [
    '-y', '-i', videoPath, ...files.flatMap((f) => ['-i', f]),
    '-filter_complex', graph(norm), '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', String(RATE), '-shortest', outPath,
  ]
  const run = runFfmpeg(ffmpegPath, args)
  run.child.stdin.end()
  try {
    await run.done
  } catch (e) {
    await killAndWait(run)
    await rm(outPath, { force: true })
    throw e
  }
}
