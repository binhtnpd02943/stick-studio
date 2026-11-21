import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { LlmScreenplaySchema, VOICE_IDS, StorySchema, fromLlmScreenplay, parseScreenplay } from '../src/index.js'

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

/** Returns a description of every constraint found in the zod tree (empty when unconstrained). */
function findConstraints(t: z.ZodTypeAny, path = '$'): string[] {
  if (t instanceof z.ZodEffects) return [`${path}: ZodEffects`]
  if (t instanceof z.ZodRecord) return [`${path}: ZodRecord`]
  if (t instanceof z.ZodObject) return Object.entries(t.shape).flatMap(([k, v]) => findConstraints(v as z.ZodTypeAny, `${path}.${k}`))
  if (t instanceof z.ZodArray) {
    const d = t._def
    const own = [d.minLength, d.maxLength, d.exactLength].some((x) => x != null) ? [`${path}: array length`] : []
    return [...own, ...findConstraints(t.element, `${path}[]`)]
  }
  if (t instanceof z.ZodOptional || t instanceof z.ZodNullable) return findConstraints(t.unwrap(), path)
  if (t instanceof z.ZodString || t instanceof z.ZodNumber) return t._def.checks.length ? [`${path}: ${t._def.checks.map((c: any) => c.kind)}`] : []
  if (t instanceof z.ZodEnum || t instanceof z.ZodLiteral) return []
  return [`${path}: unsupported ${t.constructor.name}`]
}

const story = (hook: string) => ({
  title: 'T', logline: 'L', genre: 'story', hook,
  cast: [{ id: 'a', name: 'A', voice: 'narrator', look: { ink: '#141414' } }],
  scenes: [{ setting: 's', beats: [{ who: 'a', line: 'hi' }] }],
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

  it('LlmScreenplaySchema has no string/number/array checks, refine, or record anywhere', () => {
    expect(findConstraints(LlmScreenplaySchema)).toEqual([])
  })

  it('StorySchema rejects a 13-word hook and accepts 12', () => {
    expect(StorySchema.safeParse(story('một hai ba bốn năm sáu bảy tám chín mười mười_một mười_hai mười_ba')).success).toBe(false)
    expect(StorySchema.safeParse(story('một hai ba bốn năm sáu bảy tám chín mười mười_một mười_hai')).success).toBe(true)
  })

  it('VOICE_IDS has 6 entries', () => {
    expect(VOICE_IDS).toHaveLength(6)
  })
})
