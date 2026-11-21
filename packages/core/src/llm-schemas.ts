import { z } from 'zod'
import { VOICE_IDS } from './providers.js'

// Unconstrained twins of StorySchema/ScreenplaySchema: structured outputs reject
// string/number constraints and records. Real limits live in the prompt and in parseScreenplay.

export const LlmStorySchema = z.object({
  title: z.string(),
  logline: z.string(),
  genre: z.enum(['story', 'explainer']),
  hook: z.string(),
  cast: z.array(z.object({
    id: z.string(),
    name: z.string(),
    voice: z.enum(VOICE_IDS),
    look: z.object({ ink: z.string(), hair: z.enum(['short', 'long', 'ponytail', 'none']).optional() }),
  })),
  scenes: z.array(z.object({
    setting: z.string(),
    beats: z.array(z.object({ who: z.string(), line: z.string(), action_hint: z.string().optional() })),
  })),
  content_warnings: z.array(z.string()),
})

export const LlmScreenplaySchema = z.object({
  version: z.literal(1),
  format: z.object({ aspect: z.literal('9:16'), fps: z.literal(30) }),
  title: z.string().optional(),
  cast: z.array(z.object({
    id: z.string(),
    name: z.string(),
    look: z.object({ ink: z.string(), hair: z.enum(['short', 'long', 'ponytail', 'none']).optional() }),
    voice: z.enum(VOICE_IDS),
  })),
  scenes: z.array(z.object({
    id: z.string(),
    backdrop: z.string(),
    props: z.array(z.object({ id: z.string(), type: z.string(), mark: z.string() })),
    start: z.array(z.object({ who: z.string(), mark: z.string() })),
    beats: z.array(z.object({
      say: z.object({ who: z.string(), text: z.string() }).optional(),
      do: z.array(z.object({ who: z.string(), action: z.string(), target: z.string().optional() })).optional(),
      camera: z.object({ zoom: z.number(), focus: z.string() }).optional(),
    })),
  })),
})

export type LlmScreenplay = z.infer<typeof LlmScreenplaySchema>

/** Turns `start` back into a record so the result can go through parseScreenplay. */
export function fromLlmScreenplay(x: LlmScreenplay): unknown {
  return {
    ...x,
    scenes: x.scenes.map((s) => ({ ...s, start: Object.fromEntries(s.start.map(({ who, mark }) => [who, mark])) })),
  }
}
