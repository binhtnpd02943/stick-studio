import { join } from 'node:path'
import type { FilmStep, LlmProvider, TtsProvider } from '@stick/core'
import { ClaudeLlm, FakeLlm, FakeTts, type Ledger, SayTts, type ServerConfig, cachedTts, fakeFilmResponses, meteredLlm, meteredTts } from '@stick/providers'

function innerLlm(cfg: ServerConfig, step: FilmStep): LlmProvider {
  if (cfg.fake) return new FakeLlm(step === 'story' || step === 'screenplay' ? [fakeFilmResponses()[step]] : [])
  if (!cfg.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is required unless STICK_FAKE=1')
  return new ClaudeLlm({ apiKey: cfg.anthropicApiKey, model: cfg.llmModel })
}

/** Metered providers for one step; only TTS cache misses reach the ledger. */
export function stepProviders(cfg: ServerConfig, step: FilmStep, ledger: Ledger): { llm: LlmProvider; tts: TtsProvider } {
  const tts = cfg.fake ? new FakeTts() : new SayTts()
  return {
    llm: meteredLlm(innerLlm(cfg, step), ledger),
    tts: cachedTts(meteredTts(tts, ledger), join(cfg.cacheDir, 'tts')),
  }
}
