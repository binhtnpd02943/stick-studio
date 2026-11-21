import { z } from 'zod'

export type Mark = 'left' | 'center' | 'right' | `near:${string}`

const MARK_RE = /^(left|center|right|near:.+)$/
const MarkSchema = z.string().regex(MARK_RE, 'must be left, center, right or near:<prop>') as unknown as z.ZodType<Mark>

const HexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color')

const CastSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  look: z.object({
    ink: HexSchema,
    hair: z.enum(['short', 'long', 'ponytail', 'none']).optional(),
  }),
  voice: z.string().min(1),
})

const ActionSchema = z.object({
  who: z.string().min(1),
  action: z.string().min(1),
  target: z.string().min(1).optional(), // Mark | prop id
  params: z.record(z.unknown()).optional(),
})

const BeatSchema = z
  .object({
    say: z.object({ who: z.string().min(1), text: z.string().min(1).max(160) }).optional(),
    do: z.array(ActionSchema).optional(),
    camera: z.object({ zoom: z.number().min(1).max(2), focus: z.string().min(1) }).optional(),
  })
  .refine((b) => b.say !== undefined || (b.do !== undefined && b.do.length > 0), {
    message: 'a beat needs say or do',
  })

const SceneSchema = z.object({
  id: z.string().min(1),
  backdrop: z.string().min(1),
  props: z.array(z.object({ id: z.string().min(1), type: z.string().min(1), mark: MarkSchema })),
  start: z.record(MarkSchema),
  beats: z.array(BeatSchema).min(1),
})

export const ScreenplaySchema = z.object({
  version: z.literal(1),
  format: z.object({ aspect: z.literal('9:16'), fps: z.literal(30) }),
  title: z.string().optional(),
  cast: z.array(CastSchema).min(1).max(4),
  scenes: z.array(SceneSchema).min(1),
})

export type Screenplay = z.infer<typeof ScreenplaySchema>
export type Beat = z.infer<typeof BeatSchema>

export type ParseResult = { ok: true; value: Screenplay } | { ok: false; issues: string[] }

export function parseScreenplay(input: unknown): ParseResult {
  const r = ScreenplaySchema.safeParse(input)
  if (r.success) return { ok: true, value: r.data }
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }
}
