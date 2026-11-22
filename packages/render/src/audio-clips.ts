import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beatId, type Screenplay, type Timeline } from '@stick/core'
import type { AudioClip } from './audio.js'

const probeSeconds = (file: string): number => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  const s = Number(out.trim())
  if (!Number.isFinite(s) || s <= 0) throw new Error(`cannot read duration of ${file}`)
  return s
}

export const spokenBeatIds = (sp: Screenplay): string[] =>
  sp.scenes.flatMap((scene) => scene.beats.flatMap((beat, i) => (beat.say ? [beatId(scene.id, i)] : [])))

function listWavs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.wav'))
  } catch (e) {
    throw new Error(`cannot read audio dir ${dir}: ${(e as Error).message}`)
  }
}

/** `<beatId>.wav` durations found in `dir`; they win over the durations file. Throws if none match a spoken beat. */
export function audioDurations(sp: Screenplay, dir: string): Record<string, number> {
  const wavs = listWavs(dir)
  const spoken = new Set(spokenBeatIds(sp))
  for (const f of wavs) {
    if (!spoken.has(f.slice(0, -'.wav'.length))) console.error(`warning: ${f} in ${dir} matches no spoken beat id`)
  }
  const found = Object.fromEntries(
    [...spoken].filter((id) => wavs.includes(`${id}.wav`)).map((id) => [id, probeSeconds(join(dir, `${id}.wav`))]),
  )
  if (Object.keys(found).length === 0) throw new Error(`no <beatId>.wav files for this screenplay in ${dir}`)
  return found
}

/** One clip per spoken beat that has audio, placed at the line's start. */
export function audioClips(tl: Timeline, dir: string): AudioClip[] {
  const have = new Set(listWavs(dir))
  return tl.scenes
    .flatMap((s) => s.beats)
    .filter((b) => b.line && have.has(`${b.id}.wav`))
    .map((b) => ({ path: join(dir, `${b.id}.wav`), start: b.line!.start }))
}
