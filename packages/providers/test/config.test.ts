import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/index.js'

const KEY = 'sk-ant-test-0123456789'

describe('loadConfig', () => {
  it('reads key, defaults model and budget', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: KEY })).toEqual({ anthropicApiKey: KEY, llmModel: 'claude-sonnet-5-5', maxCostUsd: 1 })
  })

  it('honours STICK_LLM_MODEL and STICK_MAX_COST_USD', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: KEY, STICK_LLM_MODEL: 'claude-opus-5-5', STICK_MAX_COST_USD: '0.25' }))
      .toMatchObject({ llmModel: 'claude-opus-5-5', maxCostUsd: 0.25 })
  })

  it('throws naming ANTHROPIC_API_KEY when missing, without leaking other env values', () => {
    const bogus = 'sk-bogus-SHOULD-NOT-APPEAR'
    let err: unknown
    try { loadConfig({ SOME_OTHER_KEY: bogus }) } catch (e) { err = e }
    expect(err).toBeInstanceOf(ConfigError)
    expect((err as Error).message).toBe('ANTHROPIC_API_KEY is not set')
    expect((err as Error).message).not.toContain(bogus)
  })

  it('treats an empty key as missing', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '' })).toThrow(ConfigError)
  })

  it.each(['abc', '0', '-1', 'Infinity', 'NaN', ''])('rejects STICK_MAX_COST_USD=%j', (v) => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: KEY, STICK_MAX_COST_USD: v })).toThrow(/STICK_MAX_COST_USD/)
  })

  it('does not echo the key when the budget is invalid', () => {
    try { loadConfig({ ANTHROPIC_API_KEY: KEY, STICK_MAX_COST_USD: 'x' }) } catch (e) { expect((e as Error).message).not.toContain(KEY) }
  })
})
