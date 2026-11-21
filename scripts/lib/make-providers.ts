import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { LlmProvider, TtsProvider } from '@stick/core'
import { cachedTts, ConfigError, costUsd, ClaudeLlm, FakeLlm, FakeTts, loadConfig, SayTts } from '@stick/providers'
import { CliError } from './cli-error.js'

const EXAMPLES = resolve(import.meta.dirname, '../../examples')
const readExample = (name: string): Record<string, any> => JSON.parse(readFileSync(join(EXAMPLES, name), 'utf8'))

/** The phan-so screenplay in LLM shape: `start` is an array of {who, mark}, as the structured output schema wants. */
function fakeResponses(): unknown[] {
  const sp = readExample('phan-so.screenplay.json')
  const scenes = sp.scenes.map((s: { start: Record<string, string> }) => ({
    ...s,
    start: Object.entries(s.start).map(([who, mark]) => ({ who, mark })),
  }))
  return [readExample('phan-so.story.json'), { ...sp, scenes }]
}

/** `.env` is read from the working directory only, and never overrides variables already set. */
export function loadDotEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env')
}

export interface Providers { llm: LlmProvider; tts: TtsProvider; model: string; maxCostUsd: number }

export function makeProviders(fake: boolean, ttsCacheDir: string): Providers {
  const cfg = loadConfig(fake ? { ...process.env, ANTHROPIC_API_KEY: 'unused-in-fake-mode' } : process.env)
  const model = fake ? 'fake' : cfg.llmModel
  try {
    costUsd({ model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  } catch {
    throw new CliError(1, `error: ${ConfigError.name}: no price known for model "${model}"; set STICK_LLM_MODEL to a priced model`)
  }
  // STICK_FAKE_EMPTY only means anything with --fake: an empty queue proves finished steps never call the LLM.
  const queue = process.env.STICK_FAKE_EMPTY === '1' ? [] : fakeResponses()
  return {
    llm: fake ? new FakeLlm(queue) : new ClaudeLlm({ apiKey: cfg.anthropicApiKey, model }),
    tts: cachedTts(fake ? new FakeTts() : new SayTts(), ttsCacheDir),
    model,
    maxCostUsd: cfg.maxCostUsd,
  }
}
