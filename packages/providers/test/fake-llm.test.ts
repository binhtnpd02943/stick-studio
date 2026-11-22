import { LlmSchemaError, type LlmRequest, MAX_HOOK_WORDS, StorySchema } from '@stick/core'
import { describe, expect, it, test } from 'vitest'
import { z } from 'zod/v4'
import { FakeLlm, fakeFilmResponses } from '../src/index.js'

const req = (): LlmRequest<{ n: number }> => ({
  system: 's', cacheSystem: false, messages: [{ role: 'user', content: 'x' }], schema: z.object({ n: z.number() }), effort: 'low', maxTokens: 10,
})

describe('FakeLlm', () => {
  it('returns queued values in order and records requests', async () => {
    const llm = new FakeLlm([{ n: 1 }, { n: 2 }])
    const a = req(), b = req()
    expect((await llm.generate(a)).value).toEqual({ n: 1 })
    expect((await llm.generate(b)).value).toEqual({ n: 2 })
    expect(llm.requests).toEqual([a, b])
  })

  it('throws when exhausted', async () => {
    await expect(new FakeLlm([]).generate(req())).rejects.toThrow(/exhausted/)
  })

  it('parses responses through the request schema', async () => {
    await expect(new FakeLlm([{ n: 'x' }]).generate(req())).rejects.toBeInstanceOf(LlmSchemaError)
  })

  it('reports zero usage', async () => {
    const { usage } = await new FakeLlm([{ n: 1 }]).generate(req())
    expect(usage).toEqual({ model: 'fake', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  })
})

describe('fakeFilmResponses', () => {
  test('without a title it is the canned phan-so film', () => {
    const { story, screenplay } = fakeFilmResponses() as { story: { title: string }; screenplay: { title: string } }
    expect(story.title).toBe('Phân số là gì?')
    expect(screenplay.title).toBe('Phân số là gì?')
  })

  test('a title becomes the story and screenplay title and the opening question, deterministically', () => {
    type Sp = { title: string; scenes: { beats: { say?: { text: string } }[] }[] }
    type St = { title: string; hook: string; scenes: { beats: { line: string }[] }[] }
    const a = fakeFilmResponses('Vì sao lá rụng?') as { story: St; screenplay: Sp }
    expect(a.story.title).toBe('Vì sao lá rụng?')
    expect(a.story.hook).toBe('Lan ơi, vì sao lá rụng?')
    expect(a.story.scenes[0]!.beats[0]!.line).toBe('Lan ơi, vì sao lá rụng?')
    expect(a.screenplay.title).toBe('Vì sao lá rụng?')
    expect(a.screenplay.scenes[0]!.beats[0]!.say!.text).toBe('Lan ơi, vì sao lá rụng?')
    expect(fakeFilmResponses('Vì sao lá rụng?')).toEqual(a)
  })
})

describe('fakeFilmResponses with a long title', () => {
  test('an 80-character title still makes a valid story: the opening uses the title only when the hook stays within its word cap', () => {
    const title = 'Tại sao bầu trời lại có màu xanh vào ban ngày và màu cam khi hoàng hôn buông xuống?'.slice(0, 80)
    expect(title).toHaveLength(80)
    const { story, screenplay } = fakeFilmResponses(title) as { story: { title: string; hook: string }; screenplay: { title: string } }
    const parsed = StorySchema.safeParse(story)
    expect(parsed.error?.issues).toBeUndefined()
    expect(story.title).toBe(title)
    expect(screenplay.title).toBe(title)
    expect(story.hook.trim().split(/\s+/).length).toBeLessThanOrEqual(MAX_HOOK_WORDS)
  })

  test('a short title still opens with it and parses', () => {
    const { story } = fakeFilmResponses('Vì sao lá rụng?')
    expect(StorySchema.safeParse(story).error?.issues).toBeUndefined()
  })
})
