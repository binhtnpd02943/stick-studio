import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'
import { LlmTruncatedError, type LlmUsage } from '@stick/core'
import { ScreenplayRejectedError } from '@stick/pipeline'
import { ClaudeLlm } from '@stick/providers'
import { z } from 'zod/v4'
import { describe, expect, test } from 'vitest'
import { CliError } from './lib/cli-error.js'
import { describeFailure } from './lib/make-errors.js'
import { slugify } from './lib/run-dir.js'
import { budgeted, RunState } from './lib/run-state.js'

const SLOW = 300_000
const ROOT = resolve(import.meta.dirname, '..')
const TSX = join(ROOT, 'node_modules/.bin/tsx')
const SCRIPT = join(ROOT, 'scripts/make-film.ts')
const tmp = mkdtempSync(join(tmpdir(), 'stick-make-'))

const make = (args: string[], env: NodeJS.ProcessEnv = {}, cwd = ROOT) =>
  spawnSync(TSX, [SCRIPT, ...args], { encoding: 'utf8', cwd, env: { ...process.env, ...env } })
const readRun = (out: string) => JSON.parse(readFileSync(join(out, 'run.json'), 'utf8')) as { steps: Record<string, string>; durationSec: number; costUsd: number }
const probe = (file: string, entries: string) =>
  spawnSync('ffprobe', ['-v', 'error', '-show_entries', entries, '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim()

describe('make-film CLI', () => {
  const out = join(tmp, 'fake-run')

  test('make --fake renders an mp4 of the solved duration at 1080x1920', () => {
    const r = make(['Phân số là gì?', '--fake', '--out', out])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(probe(join(out, 'film.mp4'), 'stream=width,height')).toBe('1080,1920')
    const seconds = Number(probe(join(out, 'film.mp4'), 'format=duration'))
    expect(Math.abs(seconds - readRun(out).durationSec)).toBeLessThan(0.1)
    expect(r.stdout).toContain('cost: $0.0000')
  }, SLOW)

  test('second run reuses artifacts', () => {
    const before = readRun(out)
    const mtime = statSync(join(out, 'film.mp4')).mtimeMs
    const r = make(['Phân số là gì?', '--fake', '--out', out], { STICK_FAKE_EMPTY: '1' })
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(readRun(out).steps).toEqual(before.steps)
    expect(statSync(join(out, 'film.mp4')).mtimeMs).toBe(mtime)
  }, SLOW)

  test('a run dir holding another topic is refused, not silently resumed', () => {
    const r = make(['Chủ đề khác hẳn', '--fake', '--out', out], { STICK_FAKE_EMPTY: '1' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Phân số là gì?')
    expect(r.stderr).toContain('Chủ đề khác hẳn')
    expect(r.stderr).toContain('--fresh')
  }, SLOW)

  test('a regenerated screenplay invalidates stale voice and render markers', () => {
    const dir = join(tmp, 'stale')
    expect(make(['Phân số là gì?', '--fake', '--out', dir]).status).toBe(0)
    const before = readRun(dir).steps
    rmSync(join(dir, 'screenplay.json'))
    const r = make(['Phân số là gì?', '--fake', '--out', dir])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    const after = readRun(dir).steps
    for (const step of ['screenplay', 'voice', 'render']) expect(after[step], step).not.toBe(before[step])
    expect(after.story).toBe(before.story)
    expect(existsSync(join(dir, 'film.partial.mp4'))).toBe(false)
  }, SLOW)

  test('missing ANTHROPIC_API_KEY without --fake exits 1 naming the variable', () => {
    const cwd = mkdtempSync(join(tmp, 'nokey-'))
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    const r = spawnSync(TSX, [SCRIPT, 'chủ đề'], { encoding: 'utf8', cwd, env })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('ANTHROPIC_API_KEY')
    expect(existsSync(join(cwd, 'out'))).toBe(false)
  }, SLOW)

  test('an unpriced model exits 1 before any paid call', () => {
    const cwd = mkdtempSync(join(tmp, 'unpriced-'))
    const r = make(['chủ đề'], { ANTHROPIC_API_KEY: 'not-a-real-key', STICK_LLM_MODEL: 'claude-bogus-1' }, cwd)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('claude-bogus-1')
    expect(r.stderr).not.toContain('not-a-real-key')
    expect(existsSync(join(cwd, 'out'))).toBe(false)
  }, SLOW)

  test('a corrupt story.json exits 1 and is left untouched', () => {
    const dir = join(tmp, 'corrupt')
    mkdirSync(dir)
    writeFileSync(join(dir, 'story.json'), '{not json')
    const r = make(['Phân số là gì?', '--fake', '--out', dir])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('story.json')
    expect(readFileSync(join(dir, 'story.json'), 'utf8')).toBe('{not json')
  }, SLOW)
})

describe('slugify', () => {
  test('strips diacritics, lowercases and joins with dashes', () => expect(slugify('Phân số là gì?')).toBe('phan-so-la-gi'))
  test('never returns empty', () => expect(slugify('???')).toBe('film'))
  test('keeps at most 48 characters, without a trailing dash', () => {
    const s = slugify('một hai ba bốn năm sáu bảy tám chín mười mười một mười hai')
    expect(s.length).toBeLessThanOrEqual(48)
    expect(s.endsWith('-')).toBe(false)
  })
})

const usage = (inputTokens: number): LlmUsage => ({ model: 'claude-sonnet-5-5', inputTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })

describe('budget', () => {
  const llm = (u: LlmUsage) => ({ generate: async () => ({ value: 1 as never, usage: u }) })
  const req = {} as never

  test('books each call into run.json and blocks the next paid call over the cap with exit 4', async () => {
    const dir = mkdtempSync(join(tmp, 'budget-'))
    const run = RunState.open(dir, 'topic', 'claude-sonnet-5-5', false)
    const paid = budgeted(llm(usage(1_000_000)), run, 1) // $2 per call
    await paid.generate(req)
    expect(run.snapshot().costUsd).toBeCloseTo(2)
    expect(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).usage).toHaveLength(1)
    await expect(paid.generate(req)).rejects.toMatchObject({ exitCode: 4 })
    expect(run.snapshot().usage).toHaveLength(1)
  })

  test('a dated served model id is still booked at the configured model price', async () => {
    const dir = mkdtempSync(join(tmp, 'budget3-'))
    const run = RunState.open(dir, 'topic', 'claude-sonnet-5-5', false)
    const reply = { model: 'claude-sonnet-5-5-20261101', stop_reason: 'end_turn', content: [{ type: 'text', text: '{"ok":true}' }], usage: { input_tokens: 1_000_000, output_tokens: 0 } }
    const client = { messages: { create: async () => reply } } as unknown as Anthropic
    const paid = budgeted(new ClaudeLlm({ apiKey: 'k', model: 'claude-sonnet-5-5', client }), run, 10)
    await paid.generate({ system: 's', cacheSystem: false, messages: [], schema: z.object({ ok: z.boolean() }), effort: 'low', maxTokens: 10 })
    expect(run.snapshot().costUsd).toBeCloseTo(2)
    expect(run.snapshot().usage[0]).toMatchObject({ model: 'claude-sonnet-5-5', servedModel: 'claude-sonnet-5-5-20261101' })
  })

  test('a paid call that fails after returning is booked and the error still propagates', async () => {
    const dir = mkdtempSync(join(tmp, 'budget5-'))
    const run = RunState.open(dir, 'topic', 'claude-sonnet-5-5', false)
    const err = new LlmTruncatedError('cut off', usage(1_000_000))
    const paid = budgeted({ generate: async () => { throw err } }, run, 10)
    await expect(paid.generate(req)).rejects.toBe(err)
    expect(run.snapshot().costUsd).toBeCloseTo(2)
    expect(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).usage).toHaveLength(1)
    const plain = budgeted({ generate: async () => { throw new Error('network') } }, run, 10)
    await expect(plain.generate(req)).rejects.toThrow('network')
    expect(run.snapshot().usage).toHaveLength(1)
  })

  test('usage is saved even if pricing throws', () => {
    const dir = mkdtempSync(join(tmp, 'budget4-'))
    const run = RunState.open(dir, 'topic', 'x', false)
    expect(() => run.book({ ...usage(5), model: 'unknown-model' })).toThrow()
    expect(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).usage).toHaveLength(1)
  })

  test('clearFrom drops that step and every later one', () => {
    const run = RunState.open(mkdtempSync(join(tmp, 'clear-')), 'topic', 'fake', false)
    for (const s of ['story', 'screenplay', 'voice', 'render'] as const) run.markStep(s)
    run.clearFrom('voice')
    expect(Object.keys(run.snapshot().steps)).toEqual(['story', 'screenplay'])
  })

  test('reopening with another topic throws unless fresh', () => {
    const dir = mkdtempSync(join(tmp, 'topic-'))
    RunState.open(dir, 'one', 'fake', false)
    expect(() => RunState.open(dir, 'two', 'fake', false)).toThrow(/"one".*"two".*--fresh/)
    expect(() => RunState.open(dir, 'two', 'fake', true)).not.toThrow()
  })

  test('a call that ends over the cap is kept (the film still finishes)', async () => {
    const dir = mkdtempSync(join(tmp, 'budget2-'))
    const run = RunState.open(dir, 'topic', 'claude-sonnet-5-5', false)
    await expect(budgeted(llm(usage(1_000_000)), run, 1).generate(req)).resolves.toBeDefined()
  })
})

describe('describeFailure', () => {
  test('a rejected screenplay is exit 2 and lists issues', () => {
    const e = new ScreenplayRejectedError([{ code: 'unknown_action', path: 'scenes.0', message: 'x' }], ['ride_bike'])
    const f = describeFailure(e)
    expect(f.code).toBe(2)
    expect(f.text).toContain('unknown_action')
  })
  test('provider errors are exit 1 on one line naming the class', () => {
    class AuthenticationError extends Error {}
    expect(describeFailure(new AuthenticationError('401 invalid x-api-key'))).toEqual({ code: 1, text: 'error: AuthenticationError: 401 invalid x-api-key' })
  })
  test('a CliError keeps its own code', () => expect(describeFailure(new CliError(3, 'motion')).code).toBe(3))
})
