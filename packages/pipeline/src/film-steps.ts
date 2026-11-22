import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseScreenplay, StorySchema, wavSeconds, type FilmStep, type Issue, type LlmProvider, type Screenplay, type Story, type Timeline, type TtsProvider } from '@stick/core'
import type { Catalog } from '@stick/library'
import { SCREENPLAY_PROMPT_VERSION, STORY_PROMPT_VERSION, type RecentStory } from '@stick/prompts'
import { gateFindings, renderContactSheet, renderFilm, SFX_VERSION, spokenBeatIds } from '@stick/render'
import { draftScreenplay } from './screenplay.js'
import { solveTimeline } from './solve.js'
import { writeStory } from './story.js'
import { validateScreenplay } from './validate.js'
import { voiceScreenplay } from './voice.js'

export { STEP_FILES } from '@stick/core'

/** Bump one when that step's output for the same input changes. */
export const STEP_VERSIONS: Record<FilmStep, string> = {
  story: STORY_PROMPT_VERSION,
  screenplay: SCREENPLAY_PROMPT_VERSION,
  validate: 'v1',
  voice: 'v1',
  timeline: 'v1',
  gate: 'v1',
  render: `render@1+sfx@${SFX_VERSION}`,
  contact: 'v1',
}

export interface StepEnv { dir: string; llm: LlmProvider; tts: TtsProvider; catalog: Catalog; sfxCacheDir: string; music?: string; skipGates?: boolean }
export interface FilmInput { topic: string; genre?: Story['genre']; recent: RecentStory[] }
export interface StepReport { libraryRequests?: string[]; repairRounds?: number; durationSec?: number; meta?: Record<string, unknown> }

export class ScreenplayInvalidError extends Error {
  constructor(readonly issues: Issue[]) {
    super(`screenplay invalid: ${issues.map((i) => `${i.code} ${i.path}`).join('; ')}`)
    this.name = 'ScreenplayInvalidError'
  }
}

export class GateFailedError extends Error {
  constructor(readonly findings: string[]) {
    super(`motion/pacing findings: ${findings.join('; ')}`)
    this.name = 'GateFailedError'
  }
}

const tmpName = (file: string) => `${file}.tmp-${process.pid}`

function writeJson(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, name)
  writeFileSync(tmpName(file), JSON.stringify(value, null, 2) + '\n')
  renameSync(tmpName(file), file)
}

/** Writes `name` through `write(partial)` and renames it into place only when complete, so a crash never leaves a truncated output. */
async function writeAtomically(dir: string, name: string, partialName: string, write: (partial: string) => Promise<unknown>): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const partial = join(dir, partialName)
  try {
    await write(partial)
    rmSync(join(dir, name), { recursive: true, force: true }) // a directory cannot be renamed over a non-empty one
    renameSync(partial, join(dir, name))
  } finally {
    rmSync(partial, { recursive: true, force: true })
  }
}

function readJson(dir: string, name: string): unknown {
  const file = join(dir, name)
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`cannot read ${file}: ${(e as Error).message}`)
  }
}

function readStory(dir: string): Story {
  const r = StorySchema.safeParse(readJson(dir, 'story.json'))
  if (!r.success) throw new Error(`${join(dir, 'story.json')} is invalid: ${r.error.message}`)
  return r.data
}

function readScreenplay(dir: string): Screenplay {
  const r = parseScreenplay(readJson(dir, 'screenplay.json'))
  if (!r.ok) throw new Error(`${join(dir, 'screenplay.json')} is invalid: ${r.issues.join('; ')}`)
  return r.value
}

// shortcut: timeline.json is only ever written by the timeline step, and there is no Timeline schema; add one if it becomes user-editable.
const readTimeline = (dir: string): Timeline => readJson(dir, 'timeline.json') as Timeline

/** Seconds of every spoken beat's `<beatId>.wav`, read from the WAV header as voiceScreenplay reports them. */
function lineDurations(sp: Screenplay, audio: string): Record<string, number> {
  return Object.fromEntries(
    spokenBeatIds(sp).map((id) => {
      const file = join(audio, `${id}.wav`)
      if (!existsSync(file)) throw new Error(`missing ${file}: run the voice step first`)
      return [id, wavSeconds(readFileSync(file))]
    }),
  )
}

/** Runs one film step: reads its STEP_FILES reads from `env.dir` and writes its writes there. */
export async function runFilmStep(step: FilmStep, env: StepEnv, input: FilmInput): Promise<StepReport> {
  const { dir } = env
  switch (step) {
    case 'story': {
      const { story } = await writeStory(env.llm, input)
      writeJson(dir, 'story.json', story)
      return { meta: { title: story.title, logline: story.logline } }
    }
    case 'screenplay': {
      const { screenplay, libraryRequests, rounds } = await draftScreenplay(env.llm, readStory(dir), env.catalog)
      writeJson(dir, 'screenplay.json', screenplay)
      return { libraryRequests, repairRounds: rounds }
    }
    case 'validate': {
      const issues = validateScreenplay(readScreenplay(dir), env.catalog)
      if (issues.length) throw new ScreenplayInvalidError(issues)
      return {}
    }
    case 'voice': {
      const sp = readScreenplay(dir)
      await writeAtomically(dir, 'audio', `audio.partial-${process.pid}`, (partial) => voiceScreenplay(sp, env.tts, partial))
      return {}
    }
    case 'timeline': {
      const sp = readScreenplay(dir)
      const tl = solveTimeline(sp, lineDurations(sp, join(dir, 'audio')), env.catalog)
      writeJson(dir, 'timeline.json', tl)
      return { durationSec: tl.duration }
    }
    case 'gate': {
      const findings = gateFindings(readTimeline(dir), env.catalog)
      writeJson(dir, 'gate.json', { findings })
      if (findings.length && !env.skipGates) throw new GateFailedError(findings)
      return {}
    }
    case 'render': {
      const tl = readTimeline(dir)
      const opts = { audioDir: join(dir, 'audio'), sfxCacheDir: env.sfxCacheDir, music: env.music, catalog: env.catalog }
      await writeAtomically(dir, 'film.mp4', 'film.partial.mp4', (partial) => renderFilm(tl, opts, partial))
      return {}
    }
    case 'contact': {
      const tl = readTimeline(dir)
      await writeAtomically(dir, 'contact.png', 'contact.partial.png', (partial) => renderContactSheet(tl, partial, { catalog: env.catalog }))
      return {}
    }
  }
}
