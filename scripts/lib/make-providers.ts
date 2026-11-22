import { existsSync } from 'node:fs'
import type { LlmProvider, TtsProvider } from '@stick/core'
import { cachedTts, ConfigError, costUsd, ClaudeLlm, FakeLlm, FakeTts, fakeFilmResponses, loadConfig, SayTts } from '@stick/providers'
import { CliError } from './cli-error.js'

const fakeQueue = (): unknown[] => {
  const { story, screenplay } = fakeFilmResponses()
  return [story, screenplay]
}

/** `.env` is read from the working directory only, and never overrides variables already set. */
export function loadDotEnv(): void {
  if (existsSync('.env')) process.loadEnvFile('.env')
}

export interface Providers { llm: LlmProvider; tts: TtsProvider; model: string; maxCostUsd: number }

/** `reuseStory`: a finished story.json will be reused, so the fake queue must start at the screenplay. */
export function makeProviders(fake: boolean, ttsCacheDir: string, reuseStory = false): Providers {
  const cfg = loadConfig(fake ? { ...process.env, ANTHROPIC_API_KEY: 'unused-in-fake-mode' } : process.env)
  const model = fake ? 'fake' : cfg.llmModel
  try {
    costUsd({ model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  } catch {
    throw new CliError(1, `error: ${ConfigError.name}: no price known for model "${model}"; set STICK_LLM_MODEL to a priced model`)
  }
    return {
    // STICK_FAKE_EMPTY only means anything with --fake: an empty queue proves finished steps never call the LLM.
    llm: fake ? new FakeLlm(process.env.STICK_FAKE_EMPTY === '1' ? [] : fakeQueue().slice(reuseStory ? 1 : 0)) : new ClaudeLlm({ apiKey: cfg.anthropicApiKey, model }),
    tts: cachedTts(fake ? new FakeTts() : new SayTts(), ttsCacheDir),
    model,
    maxCostUsd: cfg.maxCostUsd,
  }
}
