import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beatId, type Screenplay, type Timeline } from '@stick/core'
import type { AudioClip } from '@stick/render'

const probeSeconds = (file: string): number => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' })
  const s = Number(out.trim())
  if (!Number.isFinite(s) || s <= 0) throw new Error(`cannot read duration of ${file}`)
  return s
}

const audioPath = (dir: string, id: string) => join(dir, `${id}.wav`)

/** `<beatId>.wav` durations found in `dir`; they win over the durations file. */
export function audioDurations(sp: Screenplay, dir: string): Record<string, number> {
  const found: Record<string, number> = {}
  for (const scene of sp.scenes) {
    scene.beats.forEach((beat, i) => {
      const id = beatId(scene.id, i)
      if (beat.say && existsSync(audioPath(dir, id))) found[id] = probeSeconds(audioPath(dir, id))
    })
  }
  return found
}

/** One clip per spoken beat that has audio, placed at the line's start. */
export function audioClips(tl: Timeline, dir: string): AudioClip[] {
  return tl.scenes
    .flatMap((s) => s.beats)
    .filter((b) => b.line && existsSync(audioPath(dir, b.id)))
    .map((b) => ({ path: audioPath(dir, b.id), start: b.line!.start }))
}
