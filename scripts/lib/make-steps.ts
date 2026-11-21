import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseScreenplay, StorySchema, type LlmProvider, type Screenplay, type Story, type TtsProvider } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { draftScreenplay, ScreenplayRejectedError, validateScreenplay, voiceScreenplay, writeStory } from '@stick/pipeline'
import { audioDurations, spokenBeatIds } from './audio-clips.js'
import { CliError } from './cli-error.js'
import { readArtifact, recentStories, writeArtifact, type ArtifactSchema } from './run-dir.js'
import type { RunState } from './run-state.js'

/** Each step returns what it produced and whether it actually ran, so later steps know their inputs are stale. */
export interface StepResult<T> { value: T; ran: boolean }
interface Ctx { dir: string; run: RunState; fresh: boolean }

const screenplayArtifact: ArtifactSchema<Screenplay> = {
  safeParse(raw) {
    const r = parseScreenplay(raw)
    return r.ok ? { success: true, data: r.value } : { success: false, error: { message: r.issues.join('; ') } }
  },
}

export async function storyStep(ctx: Ctx, llm: LlmProvider, topic: string, genre: Story['genre'] | undefined, outRoot: string): Promise<StepResult<Story>> {
  const cached = ctx.fresh ? undefined : readArtifact(ctx.dir, 'story.json', StorySchema)
  if (cached) return { value: cached, ran: false }
  const { story } = await writeStory(llm, { topic, genre, recent: recentStories(outRoot) })
  writeArtifact(ctx.dir, 'story.json', story)
  ctx.run.markStep('story')
  return { value: story, ran: true }
}

export async function screenplayStep(ctx: Ctx, llm: LlmProvider, story: Story): Promise<StepResult<Screenplay>> {
  const cached = ctx.fresh ? undefined : readArtifact(ctx.dir, 'screenplay.json', screenplayArtifact)
  if (cached) return { value: cached, ran: false }
  try {
    const { screenplay, libraryRequests, rounds } = await draftScreenplay(llm, story, defaultCatalog)
    writeArtifact(ctx.dir, 'screenplay.json', screenplay)
    ctx.run.update({ libraryRequests, repairRounds: rounds })
    ctx.run.markStep('screenplay')
    return { value: screenplay, ran: true }
  } catch (e) {
    if (e instanceof ScreenplayRejectedError) ctx.run.update({ libraryRequests: e.libraryRequests })
    throw e
  }
}

/** A hand-edited screenplay.json must pass the same checks as a generated one. */
export function assertValid(sp: Screenplay): void {
  const issues = validateScreenplay(sp, defaultCatalog)
  if (issues.length) throw new CliError(2, issues.map((i) => `${i.code} ${i.path} ${i.message}`).join('\n'))
}

export async function voiceStep(ctx: Ctx, sp: Screenplay, tts: TtsProvider, stale: boolean): Promise<StepResult<Record<string, number>>> {
  const audio = join(ctx.dir, 'audio')
  const done = !stale && ctx.run.snapshot().steps.voice && spokenBeatIds(sp).every((id) => existsSync(join(audio, `${id}.wav`)))
  if (done) return { value: audioDurations(sp, audio), ran: false }
  const value = await voiceScreenplay(sp, tts, audio)
  ctx.run.markStep('voice')
  return { value, ran: true }
}
