import { LlmSchemaError, type LlmRequest } from '@stick/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { FakeLlm } from '../src/index.js'

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
