import { mkdir, rename, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SFX_IDS, type SfxId, type Timeline } from '@stick/core'
import { loadRig } from '@stick/engine'
import { lookup, type Catalog } from '@stick/library'
import { killAndWait, runFfmpeg } from './ffmpeg.js'
import { sceneStateAt } from './state.js'

export { SFX_IDS, type SfxId }

/** Bump when a filter below changes: the version is part of the cached file name. */
export const SFX_VERSION = 1
const RATE = 48000
// Noise comes from a fixed seed, so every id renders to the same bytes on every run.
const noise = (d: number, seed: number) => `anoisesrc=d=${d}:r=${RATE}:c=white:a=0.9:seed=${seed}`
const decay = (rate: number) => `volume='exp(-${rate}*t)':eval=frame`
const burst = (d: number, expr: string, post: string) => `aevalsrc='${expr}':s=${RATE}:d=${d},${post}`

const FILTERS: Record<SfxId, string> = {
  step: `${noise(0.08, 1)},bandpass=f=1800:width_type=h:w=2400,${decay(45)}`,
  pop: burst(0.12, '0.9*sin(2*PI*(900*t-2500*t*t))*exp(-25*t)', 'afade=t=out:st=0.11:d=0.01'),
  whoosh: `${noise(0.35, 2)},bandpass=f=1200:width_type=h:w=1800,volume='pow(sin(PI*t/0.35),2)':eval=frame`,
  ting: burst(0.6, '(0.6*sin(2*PI*1760*t)+0.15*sin(2*PI*3520*t))*exp(-8*t)', 'afade=t=out:st=0.58:d=0.02'),
  thud: burst(0.25, '(0.8*sin(2*PI*70*t)+0.25*(random(0)*2-1))*exp(-18*t)', 'lowpass=f=400'),
  clap: `${noise(0.1, 3)},highpass=f=900,${decay(45)},volume=0.7`,
  knock: burst(0.12, '(0.8*sin(2*PI*180*t)+0.2*(random(0)*2-1))*exp(-35*t)', 'lowpass=f=1500'),
}

/** The cached wav for `id` (48 kHz mono 16-bit), synthesised with ffmpeg on first use. */
export async function ensureSfx(id: SfxId, cacheDir: string, opts: { ffmpegPath?: string } = {}): Promise<string> {
  const { ffmpegPath = 'ffmpeg' } = opts
  const path = join(cacheDir, `${id}@${SFX_VERSION}.wav`)
  if (existsSync(path)) return path
  await mkdir(cacheDir, { recursive: true })
  // Unique per call so concurrent callers never share a partial; renamed when complete, so a crash never leaves a truncated cache entry.
  const partial = `${path}.partial-${process.pid}-${randomBytes(4).toString('hex')}.wav`
  const run = runFfmpeg(ffmpegPath, ['-y', '-f', 'lavfi', '-i', FILTERS[id], '-ar', String(RATE), '-ac', '1', '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-flags:a', '+bitexact', partial])
  run.child.stdin.end()
  try {
    await run.done
    await rename(partial, path)
  } catch (e) {
    await killAndWait(run)
    await rm(partial, { force: true })
    throw e
  }
  return path
}

const NEAR_END_S = 1e-3

/** Every action's sound cues at film time, sorted by start; cues past the film's end are clamped to it. */
export function sfxCues(tl: Timeline, catalog: Catalog): { id: SfxId; start: number }[] {
  const rig = loadRig()
  const travelled = (who: string, from: number, to: number): number => {
    const x = (t: number) => sceneStateAt(tl, t, rig, catalog).chars.find((c) => c.id === who)?.x ?? 0
    return Math.abs(x(to - NEAR_END_S) - x(from))
  }
  const cues = tl.scenes
    .flatMap((s) => s.beats)
    .flatMap((b) => b.tracks)
    .flatMap((tr) => {
      const def = lookup(catalog.actions, tr.action)
      if (!def?.sfx) return []
      const dur = tr.end - tr.start
      const distance = def.speed === undefined ? 0 : travelled(tr.who, tr.start, tr.end)
      return def.sfx(dur, { rig, distance }).map((c) => ({ id: c.id, start: Math.min(tr.start + c.at, tl.duration) }))
    })
  return cues.sort((a, b) => a.start - b.start || SFX_IDS.indexOf(a.id) - SFX_IDS.indexOf(b.id))
}
