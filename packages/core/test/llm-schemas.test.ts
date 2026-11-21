import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { LlmScreenplaySchema, LlmStorySchema, VOICE_IDS, StorySchema, fromLlmScreenplay, parseScreenplay } from '../src/index.js'

const phanSo = JSON.parse(readFileSync(new URL('../../../examples/phan-so.screenplay.json', import.meta.url), 'utf8'))

/** Convert a plain screenplay to the LLM shape: start record -> [{who, mark}], params dropped. */
function toLlmShape(sp: any) {
  return {
    ...sp,
    scenes: sp.scenes.map((s: any) => ({
      ...s,
      start: Object.entries(s.start).map(([who, mark]) => ({ who, mark })),
      beats: s.beats.map((b: any) => ({
        ...b,
        ...(b.do && { do: b.do.map(({ params: _p, ...a }: any) => a) }),
      })),
    })),
  }
}

const FORBIDDEN = ['minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'patternProperties', 'not', 'allOf']

/** Walks the JSON schema structured outputs would receive; lists every constraint it rejects (empty when clean). */
function findConstraints(node: unknown, path = '$'): string[] {
  if (Array.isArray(node)) return node.flatMap((v, i) => findConstraints(v, `${path}[${i}]`))
  if (node === null || typeof node !== 'object') return []
  const o = node as Record<string, unknown>
  const own = FORBIDDEN.filter((k) => k in o).map((k) => `${path}: ${k}`)
  if (o.type === 'object' && o.additionalProperties !== false) own.push(`${path}: additionalProperties`)
  // children of `properties` are field names (e.g. `format`), not schema keywords
  const kids = Object.entries(o).flatMap(([k, v]) => k === 'properties'
    ? Object.entries(v as object).flatMap(([f, fv]) => findConstraints(fv, `${path}.${f}`))
    : findConstraints(v, `${path}.${k}`))
  return [...own, ...kids]
}

const story = (hook: string) => ({
  title: 'T', logline: 'L', genre: 'story', hook,
  cast: [{ id: 'a', name: 'A', voice: 'narrator', look: { ink: '#141414' } }],
  scenes: [{ setting: 's', beats: [{ who: 'a', line: hook }, { who: 'a', line: 'tiếp' }] }],
  content_warnings: [],
})

describe('llm schemas', () => {
  it('LlmScreenplaySchema accepts the phan-so example minus params and round-trips', () => {
    const r = LlmScreenplaySchema.safeParse(toLlmShape(phanSo))
    expect(r.success).toBe(true)
    if (!r.success) return
    const back = parseScreenplay(fromLlmScreenplay(r.data))
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.value.scenes[0]!.start).toEqual(phanSo.scenes[0].start)
  })

  it.each([['LlmScreenplaySchema', LlmScreenplaySchema], ['LlmStorySchema', LlmStorySchema]])('%s has no constraints, refine, or record anywhere', (_n, schema) => {
    expect(findConstraints(z.toJSONSchema(schema))).toEqual([])
  })

  it('findConstraints flags what structured outputs reject', () => {
    const bad = z.object({ a: z.string().max(3), b: z.record(z.string(), z.string()), c: z.array(z.string()).min(1) })
    expect(findConstraints(z.toJSONSchema(bad)).length).toBeGreaterThanOrEqual(3)
  })

  it('StorySchema rejects a 13-word hook and accepts 12', () => {
    expect(StorySchema.safeParse(story('một hai ba bốn năm sáu bảy tám chín mười mười_một mười_hai mười_ba')).success).toBe(false)
    expect(StorySchema.safeParse(story('một hai ba bốn năm sáu bảy tám chín mười mười_một mười_hai')).success).toBe(true)
  })

  it('StorySchema requires the first line of the first beat to be the hook', () => {
    const bad = story('hook thật')
    bad.scenes[0]!.beats[0]!.line = 'câu khác'
    const r = StorySchema.safeParse(bad)
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]).toMatchObject({ path: ['hook'], message: expect.stringContaining('exactly the hook') })
    const padded = story('hook thật')
    padded.scenes[0]!.beats[0]!.line = '  hook thật '
    expect(StorySchema.safeParse(padded).success).toBe(true)
  })

  it('the phan-so example story passes', () => {
    expect(StorySchema.safeParse(JSON.parse(readFileSync(new URL('../../../examples/phan-so.story.json', import.meta.url), 'utf8'))).success).toBe(true)
  })

  it('VOICE_IDS has 6 entries', () => {
    expect(VOICE_IDS).toHaveLength(6)
  })
})
