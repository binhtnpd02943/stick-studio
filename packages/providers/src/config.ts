export class ConfigError extends Error { override name = 'ConfigError' }

export interface Config { anthropicApiKey: string; llmModel: string; maxCostUsd: number }

export const DEFAULT_MODEL = 'claude-sonnet-5-5'
const DEFAULT_MAX_COST_USD = 1

/** Messages never include env values: the key must not reach logs. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const anthropicApiKey = env.ANTHROPIC_API_KEY
  if (!anthropicApiKey) throw new ConfigError('ANTHROPIC_API_KEY is not set')
  const rawCost = env.STICK_MAX_COST_USD
  const maxCostUsd = rawCost === undefined ? DEFAULT_MAX_COST_USD : Number(rawCost.trim() === '' ? NaN : rawCost)
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new ConfigError('STICK_MAX_COST_USD must be a positive number (USD)')
  return { anthropicApiKey, llmModel: env.STICK_LLM_MODEL || DEFAULT_MODEL, maxCostUsd }
}
