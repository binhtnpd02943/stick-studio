import { resolve } from 'node:path'
import { z } from 'zod'
import { ConfigError, DEFAULT_MODEL } from './config.js'
import { costUsd } from './cost.js'

export interface ServerConfig {
  databaseUrl?: string
  pgliteDir: string
  redisUrl: string
  storageDir: string
  cacheDir: string
  /** Built SPA to serve (STICK_WEB_DIR); unset means API only. */
  webDir?: string
  host: string
  port: number
  urlSigningKey: string
  fake: boolean
  anthropicApiKey?: string
  llmModel: string
  maxCostPerFilmUsd: number
  maxCostPerDayUsd: number
}

type Role = 'api' | 'worker' | 'dev'

export const MIN_SIGNING_KEY_LENGTH = 32

// Every message is written here, never taken from zod, so no env value can reach an error.
const unset = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const str = () => z.preprocess(unset, z.string().optional())
const positive = (name: string, fallback: number) =>
  z.preprocess(
    (v) => (unset(v) === undefined ? fallback : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN),
    z.number({ message: `${name} must be a positive number (USD)` }).finite({ message: `${name} must be a positive number (USD)` }).positive({ message: `${name} must be a positive number (USD)` }),
  )
const priced = (model: string) => {
  try { costUsd({ model, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 }); return true } catch { return false }
}

const EnvSchema = z.object({
  DATABASE_URL: z.preprocess(unset, z.string().regex(/^postgres(ql)?:\/\//, { message: 'DATABASE_URL must start with postgres:// or postgresql://' }).optional()),
  STICK_PGLITE_DIR: str(),
  REDIS_URL: str(),
  STICK_STORAGE_DIR: str(),
  STICK_CACHE_DIR: str(),
  STICK_WEB_DIR: str(),
  HOST: str(),
  PORT: z.preprocess(
    (v) => (unset(v) === undefined ? 3000 : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN),
    z.number().int({ message: 'PORT must be an integer from 1 to 65535' }).min(1, { message: 'PORT must be an integer from 1 to 65535' }).max(65535, { message: 'PORT must be an integer from 1 to 65535' }),
  ),
  STICK_URL_SIGNING_KEY: str(),
  STICK_FAKE: z.preprocess(unset, z.enum(['0', '1'], { message: 'STICK_FAKE must be 0 or 1' }).default('0')),
  ANTHROPIC_API_KEY: str(),
  STICK_LLM_MODEL: z.preprocess(unset, z.string().default(DEFAULT_MODEL).refine(priced, { message: 'STICK_LLM_MODEL has no known price' })),
  STICK_MAX_COST_USD: positive('STICK_MAX_COST_USD', 1),
  STICK_MAX_COST_PER_DAY_USD: positive('STICK_MAX_COST_PER_DAY_USD', 10),
})

/** Validates at startup. Throws ConfigError naming the variable, never its value. */
export function loadServerConfig(env: Record<string, string | undefined>, role: Role): ServerConfig {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    throw new ConfigError(issue.message.includes(String(issue.path[0])) ? issue.message : `${String(issue.path[0])} is invalid`)
  }
  const e = parsed.data
  const fake = e.STICK_FAKE === '1'

  if (role !== 'worker') {
    if (!e.STICK_URL_SIGNING_KEY) throw new ConfigError('STICK_URL_SIGNING_KEY is required')
    if (e.STICK_URL_SIGNING_KEY.length < MIN_SIGNING_KEY_LENGTH) {
      throw new ConfigError(`STICK_URL_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_LENGTH} characters`)
    }
  }
  if (role !== 'api' && !fake && !e.ANTHROPIC_API_KEY) throw new ConfigError('ANTHROPIC_API_KEY is required unless STICK_FAKE=1')

  return {
    databaseUrl: e.DATABASE_URL,
    pgliteDir: resolve(e.STICK_PGLITE_DIR ?? 'out/.pglite'),
    redisUrl: e.REDIS_URL ?? 'redis://127.0.0.1:6379',
    // Absolute: @fastify/static rejects a relative root, and paths should not depend on a later chdir.
    storageDir: resolve(e.STICK_STORAGE_DIR ?? 'out/storage'),
    cacheDir: resolve(e.STICK_CACHE_DIR ?? 'out/.cache'),
    webDir: e.STICK_WEB_DIR ? resolve(e.STICK_WEB_DIR) : undefined,
    host: e.HOST ?? '127.0.0.1',
    port: e.PORT,
    urlSigningKey: e.STICK_URL_SIGNING_KEY ?? '',
    fake,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    llmModel: e.STICK_LLM_MODEL,
    maxCostPerFilmUsd: e.STICK_MAX_COST_USD,
    maxCostPerDayUsd: e.STICK_MAX_COST_PER_DAY_USD,
  }
}
