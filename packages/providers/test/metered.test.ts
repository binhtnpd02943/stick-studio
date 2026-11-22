import { LlmTruncatedError, type LlmProvider, type LlmUsage } from '@stick/core'
import { describe, expect, test } from 'vitest'
import { FakeTts, meteredLlm, meteredTts, type Ledger } from '../src/index.js'

const usage: LlmUsage = { model: 'm', inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 }
const req = {} as never

function ledger(cap = Infinity) {
  const llm: LlmUsage[] = []
  const tts: { chars: number; providerId: string }[] = []
  const l: Ledger = {
    check() { if (llm.length >= cap) throw new Error('over budget') },
    bookLlm(u) { llm.push(u) },
    bookTts(chars, providerId) { tts.push({ chars, providerId }) },
  }
  return { l, llm, tts }
}

describe('metered providers', () => {
  test('meteredLlm books usage and refuses the next call when check throws', async () => {
    const { l, llm } = ledger(1)
    let calls = 0
    const inner: LlmProvider = { generate: async () => { calls++; return { value: 1 as never, usage } } }
    const paid = meteredLlm(inner, l)
    await paid.generate(req)
    expect(llm).toEqual([usage])
    await expect(paid.generate(req)).rejects.toThrow('over budget')
    expect(calls).toBe(1)
  })

  test('meteredLlm books usage carried by an error thrown after the call returned', async () => {
    const { l, llm } = ledger()
    const err = new LlmTruncatedError('cut off', usage)
    await expect(meteredLlm({ generate: async () => { throw err } }, l).generate(req)).rejects.toBe(err)
    await expect(meteredLlm({ generate: async () => { throw new Error('network') } }, l).generate(req)).rejects.toThrow('network')
    expect(llm).toEqual([usage])
  })

  test('meteredTts books character count', async () => {
    const { l, tts } = ledger()
    const t = meteredTts(new FakeTts(), l)
    expect(t.id).toBe('fake')
    await t.synthesize('xin chào', 'narrator')
    expect(tts).toEqual([{ chars: 8, providerId: 'fake' }])
  })
})
