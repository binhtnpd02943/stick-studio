import { z } from 'zod'
import { HexSchema, IdSchema } from './screenplay.js'
import { VOICE_IDS } from './providers.js'

const MAX_HOOK_WORDS = 12

export const StorySchema = z.object({
  title: z.string().min(1).max(80),
  logline: z.string().min(1),
  genre: z.enum(['story', 'explainer']),
  hook: z.string().min(1).refine((h) => h.trim().split(/\s+/).length <= MAX_HOOK_WORDS, `hook must be at most ${MAX_HOOK_WORDS} words`),
  cast: z.array(z.object({
    id: IdSchema,
    name: z.string().min(1),
    voice: z.enum(VOICE_IDS),
    look: z.object({ ink: HexSchema, hair: z.enum(['short', 'long', 'ponytail', 'none']).optional() }),
  })).min(1).max(4),
  scenes: z.array(z.object({
    setting: z.string().min(1),
    beats: z.array(z.object({
      who: z.string().min(1),
      line: z.string().min(1).max(160),
      action_hint: z.string().optional(),
    })),
  })).min(1).max(6),
  content_warnings: z.array(z.string()),
}).refine((s) => s.scenes[0]!.beats[0]?.line.trim() === s.hook.trim(), { message: 'the first line of the first beat must be exactly the hook', path: ['hook'] })

export type Story = z.infer<typeof StorySchema>
