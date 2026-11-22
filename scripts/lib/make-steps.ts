import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseScreenplay, StorySchema, type Screenplay, type Story } from '@stick/core'
import { spokenBeatIds } from '@stick/render'
import { readArtifact, type ArtifactSchema } from './run-dir.js'
import type { RunState } from './run-state.js'

/** The reuse checks: the steps themselves live in @stick/pipeline (runFilmStep). */

const screenplayArtifact: ArtifactSchema<Screenplay> = {
  safeParse(raw) {
    const r = parseScreenplay(raw)
    return r.ok ? { success: true, data: r.value } : { success: false, error: { message: r.issues.join('; ') } }
  },
}

/** The story in `dir`, or undefined if absent; a present but invalid file is exit 1, never overwritten. */
export const readStory = (dir: string): Story | undefined => readArtifact(dir, 'story.json', StorySchema)

/** story.json and screenplay.json are reused whenever they exist and parse, so a hand edit survives a rerun. */
export const storyReusable = (dir: string, fresh: boolean): boolean => !fresh && readStory(dir) !== undefined
export const screenplayReusable = (dir: string, fresh: boolean): boolean => !fresh && readArtifact(dir, 'screenplay.json', screenplayArtifact) !== undefined

/** Voice is reused when its marker is set and every spoken beat has its WAV. */
export function voiceReusable(dir: string, run: RunState): boolean {
  if (!run.snapshot().steps.voice) return false
  const sp = readArtifact(dir, 'screenplay.json', screenplayArtifact)
  return sp !== undefined && spokenBeatIds(sp).every((id) => existsSync(join(dir, 'audio', `${id}.wav`)))
}
