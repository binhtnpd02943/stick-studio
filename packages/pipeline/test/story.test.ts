import { describe, expect, test } from 'vitest'
import { FakeLlm } from '@stick/providers'
import { StoryRejectedError, writeStory } from '../src/index.js'
import { story } from './llm-fixtures.js'

describe('writeStory', () => {
  test('puts the topic only in the user turn', async () => {
    const llm = new FakeLlm([story()])
    const r = await writeStory(llm, { topic: 'bí mật của bánh pizza', recent: [] })
    expect(r.story.title).toBe(story().title)
    expect(r.usage).toHaveLength(1)
    const req = llm.requests[0]!
    expect(req.system).not.toContain('bí mật của bánh pizza')
    expect(req.messages).toHaveLength(1)
    expect(req.messages[0]!.content).toContain('<topic>bí mật của bánh pizza</topic>')
    expect(req).toMatchObject({ effort: 'medium', maxTokens: 8000 })
  })

  test('rejects a story that breaks StorySchema (hook over 12 words)', async () => {
    const bad = { ...story(), hook: 'một hai ba bốn năm sáu bảy tám chín mười mười-một mười-hai mười-ba' }
    await expect(writeStory(new FakeLlm([bad]), { topic: 't', recent: [] })).rejects.toThrow(StoryRejectedError)
  })
})
