import type Anthropic from '@anthropic-ai/sdk'
import { LlmRefusalError, LlmSchemaError, LlmTruncatedError, type LlmRequest } from '@stick/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'
import { ClaudeLlm, costUsd } from '../src/index.js'

const schema = z.object({ ok: z.boolean() })
const req = (over: Partial<LlmRequest<{ ok: boolean }>> = {}): LlmRequest<{ ok: boolean }> => ({
  system: 'SYS', cacheSystem: true, messages: [{ role: 'user', content: 'hi' }], schema, effort: 'high', maxTokens: 500, ...over,
})
const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 }
const reply = (over: Record<string, unknown> = {}) => ({
  model: 'claude-sonnet-5-5', stop_reason: 'end_turn', usage,
  content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '{"ok":true}' }], ...over,
})

function stub(response: unknown) {
  const calls: any[] = []
  const client = { messages: { create: async (p: unknown) => (calls.push(p), response) } } as unknown as Anthropic
  return { calls, llm: new ClaudeLlm({ apiKey: 'k', model: 'claude-sonnet-5-5', client }) }
}

describe('ClaudeLlm', () => {
  it('sends cache_control on the system block when cacheSystem, and not otherwise', async () => {
    const a = stub(reply())
    await a.llm.generate(req())
    expect(a.calls[0].system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }])
    const b = stub(reply())
    await b.llm.generate(req({ cacheSystem: false }))
    expect(b.calls[0].system).toEqual([{ type: 'text', text: 'SYS' }])
  })

  it('sends model, max_tokens, messages, effort and a json_schema format; never thinking or tool_choice', async () => {
    const { calls, llm } = stub(reply())
    await llm.generate(req())
    const p = calls[0]
    expect(p).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 500, messages: [{ role: 'user', content: 'hi' }] })
    expect(p.output_config.effort).toBe('high')
    expect(p.output_config.format.type).toBe('json_schema')
    expect(p.output_config.format.schema.properties.ok.type).toBe('boolean')
    expect(p).not.toHaveProperty('thinking')
    expect(p).not.toHaveProperty('tool_choice')
    expect(JSON.stringify(p)).not.toContain('budget_tokens')
  })

  it('reports the configured model as usage.model even when the API serves a dated snapshot', async () => {
    const { llm } = stub(reply({ model: 'claude-sonnet-5-5-20261101' }))
    const { usage: u } = await llm.generate(req())
    expect(u).toMatchObject({ model: 'claude-sonnet-5-5', servedModel: 'claude-sonnet-5-5-20261101' })
    expect(costUsd(u)).toBeGreaterThan(0)
  })

  it('returns the parsed value and usage with cache tokens', async () => {
    const { llm } = stub(reply())
    expect(await llm.generate(req())).toEqual({
      value: { ok: true },
      usage: { model: 'claude-sonnet-5-5', servedModel: 'claude-sonnet-5-5', inputTokens: 10, outputTokens: 5, cacheReadTokens: 7, cacheWriteTokens: 3 },
    })
  })

  it('treats null cache counters as 0', async () => {
    const { llm } = stub(reply({ usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: null, cache_creation_input_tokens: null } }))
    const { usage: u } = await llm.generate(req())
    expect([u.cacheReadTokens, u.cacheWriteTokens]).toEqual([0, 0])
  })

  it('maps stop_reason refusal to LlmRefusalError', async () => {
    await expect(stub(reply({ stop_reason: 'refusal', content: [] })).llm.generate(req())).rejects.toBeInstanceOf(LlmRefusalError)
  })

  it('maps stop_reason max_tokens to LlmTruncatedError even though the JSON is cut off', async () => {
    const r = reply({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"ok":' }] })
    await expect(stub(r).llm.generate(req())).rejects.toBeInstanceOf(LlmTruncatedError)
  })

  it.each([
    ['text that is not JSON', [{ type: 'text', text: 'nope' }]],
    ['JSON that fails the schema', [{ type: 'text', text: '{"ok":"yes"}' }]],
    ['no text block', [{ type: 'thinking', thinking: 'x' }]],
  ])('maps %s to LlmSchemaError', async (_n, content) => {
    await expect(stub(reply({ content })).llm.generate(req())).rejects.toBeInstanceOf(LlmSchemaError)
  })
})
