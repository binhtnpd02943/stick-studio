import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadServerConfig } from '../src/index.js'

const KEY32 = 'k'.repeat(32)

describe('loadServerConfig', () => {
  it('defaults apply', () => {
    expect(loadServerConfig({ STICK_URL_SIGNING_KEY: KEY32, STICK_FAKE: '1' }, 'dev')).toEqual({
      databaseUrl: undefined,
      pgliteDir: resolve('out/.pglite'),
      redisUrl: 'redis://127.0.0.1:6379',
      storageDir: resolve('out/storage'),
      cacheDir: resolve('out/.cache'),
      host: '127.0.0.1',
      port: 3000,
      urlSigningKey: KEY32,
      fake: true,
      anthropicApiKey: undefined,
      llmModel: 'claude-sonnet-5-5',
      maxCostPerFilmUsd: 1,
      maxCostPerDayUsd: 10,
    })
  })

  it('honours overrides', () => {
    const cfg = loadServerConfig({
      DATABASE_URL: 'postgresql://u:p@h/db', REDIS_URL: 'redis://r:1', HOST: '0.0.0.0', PORT: '8080',
      STICK_URL_SIGNING_KEY: KEY32, ANTHROPIC_API_KEY: 'sk-x', STICK_MAX_COST_USD: '0.5', STICK_MAX_COST_PER_DAY_USD: '2',
      STICK_STORAGE_DIR: '/s', STICK_CACHE_DIR: '/c', STICK_PGLITE_DIR: '/p',
    }, 'api')
    expect(cfg).toMatchObject({
      databaseUrl: 'postgresql://u:p@h/db', redisUrl: 'redis://r:1', host: '0.0.0.0', port: 8080,
      anthropicApiKey: 'sk-x', maxCostPerFilmUsd: 0.5, maxCostPerDayUsd: 2, storageDir: '/s', cacheDir: '/c', pgliteDir: '/p',
    })
  })

  it('relative directories become absolute, as @fastify/static requires of the storage root', () => {
    const cfg = loadServerConfig({ STICK_URL_SIGNING_KEY: KEY32, STICK_FAKE: '1', STICK_STORAGE_DIR: 'a/s', STICK_CACHE_DIR: 'a/c', STICK_PGLITE_DIR: 'a/p' }, 'dev')
    expect(cfg).toMatchObject({ storageDir: resolve('a/s'), cacheDir: resolve('a/c'), pgliteDir: resolve('a/p') })
  })

  it('STICK_WEB_DIR resolves to an absolute path; unset leaves webDir undefined', () => {
    const base = { STICK_URL_SIGNING_KEY: KEY32, STICK_FAKE: '1' }
    expect(loadServerConfig({ ...base, STICK_WEB_DIR: 'apps/web/dist' }, 'dev').webDir).toBe(resolve('apps/web/dist'))
    expect(loadServerConfig(base, 'dev').webDir).toBeUndefined()
    expect(loadServerConfig({ ...base, STICK_WEB_DIR: ' ' }, 'dev').webDir).toBeUndefined()
  })

  it.each(['api', 'dev'] as const)('%s role without STICK_URL_SIGNING_KEY names the variable', (role) => {
    expect(() => loadServerConfig({ STICK_FAKE: '1' }, role)).toThrow(new ConfigError('STICK_URL_SIGNING_KEY is required'))
  })

  it('a short STICK_URL_SIGNING_KEY is refused', () => {
    expect(() => loadServerConfig({ STICK_URL_SIGNING_KEY: 'short' }, 'api')).toThrow(/STICK_URL_SIGNING_KEY must be at least 32/)
  })

  it('worker needs no signing key', () => {
    expect(loadServerConfig({ ANTHROPIC_API_KEY: 'sk-x' }, 'worker').urlSigningKey).toBe('')
  })

  it('worker without ANTHROPIC_API_KEY fails unless STICK_FAKE=1', () => {
    expect(() => loadServerConfig({}, 'worker')).toThrow(/ANTHROPIC_API_KEY is required/)
    expect(() => loadServerConfig({ STICK_FAKE: '0' }, 'worker')).toThrow(/ANTHROPIC_API_KEY/)
    expect(() => loadServerConfig({ STICK_URL_SIGNING_KEY: KEY32 }, 'dev')).toThrow(/ANTHROPIC_API_KEY/)
    expect(loadServerConfig({ STICK_FAKE: '1' }, 'worker').fake).toBe(true)
  })

  it('api role does not need ANTHROPIC_API_KEY', () => {
    expect(loadServerConfig({ STICK_URL_SIGNING_KEY: KEY32 }, 'api').anthropicApiKey).toBeUndefined()
  })

  it('a bad DATABASE_URL scheme is refused', () => {
    expect(() => loadServerConfig({ DATABASE_URL: 'mysql://x/y', STICK_FAKE: '1' }, 'worker')).toThrow(/DATABASE_URL must start with/)
  })

  it('empty strings count as unset', () => {
    const cfg = loadServerConfig({ DATABASE_URL: '', PORT: '', STICK_LLM_MODEL: '', STICK_FAKE: '1' }, 'worker')
    expect(cfg).toMatchObject({ databaseUrl: undefined, port: 3000, llmModel: 'claude-sonnet-5-5' })
  })

  it('whitespace-only values count as unset', () => {
    const cfg = loadServerConfig({ DATABASE_URL: '  ', REDIS_URL: ' ', ANTHROPIC_API_KEY: '\t', STICK_FAKE: '1' }, 'worker')
    expect(cfg).toMatchObject({ databaseUrl: undefined, redisUrl: 'redis://127.0.0.1:6379', anthropicApiKey: undefined })
    expect(() => loadServerConfig({ STICK_URL_SIGNING_KEY: ' '.repeat(40), STICK_FAKE: '1' }, 'api')).toThrow(new ConfigError('STICK_URL_SIGNING_KEY is required'))
  })

  it.each([
    ['PORT', 'abc'], ['PORT', '0'], ['PORT', '70000'], ['PORT', '1.5'],
    ['STICK_MAX_COST_USD', '0'], ['STICK_MAX_COST_USD', '-1'], ['STICK_MAX_COST_USD', 'NaN'], ['STICK_MAX_COST_USD', 'Infinity'], ['STICK_MAX_COST_USD', 'abc'],
    ['STICK_MAX_COST_PER_DAY_USD', '0'], ['STICK_MAX_COST_PER_DAY_USD', 'x'],
    ['STICK_FAKE', 'yes'],
    ['STICK_LLM_MODEL', 'gpt-unknown'],
  ])('rejects %s=%j naming the variable', (name, value) => {
    expect(() => loadServerConfig({ [name]: value, STICK_FAKE: name === 'STICK_FAKE' ? value : '1' }, 'worker')).toThrow(new RegExp(`^${name} `))
  })

  it('no error message contains the value of any variable', () => {
    // Short on purpose: a too-short signing key must still fail validation.
    const marker = 'MARKER-xyz'
    const cases: Array<[Record<string, string>, 'api' | 'worker' | 'dev']> = [
      [{ STICK_URL_SIGNING_KEY: marker }, 'api'], // too short
      [{ DATABASE_URL: marker, STICK_FAKE: '1' }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker, STICK_FAKE: '0', PORT: marker }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker, STICK_LLM_MODEL: marker }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker, STICK_MAX_COST_USD: marker }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker, STICK_MAX_COST_PER_DAY_USD: marker }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker, STICK_FAKE: marker }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker, REDIS_URL: marker, HOST: marker, PORT: marker }, 'worker'],
      [{ ANTHROPIC_API_KEY: marker }, 'api'], // missing signing key
    ]
    for (const [env, role] of cases) {
      let err: unknown
      try { loadServerConfig(env, role) } catch (e) { err = e }
      expect(err, JSON.stringify(Object.keys(env))).toBeInstanceOf(ConfigError)
      expect((err as Error).message).not.toContain(marker)
    }
  })
})
