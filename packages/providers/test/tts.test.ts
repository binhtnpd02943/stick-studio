import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TtsProvider } from '@stick/core'
import { cachedTts, FakeTts, SayTts, silentWav, wavSeconds } from '../src/index.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tts-test-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const counting = (): TtsProvider & { calls: number } => {
  const inner = new FakeTts()
  const t = {
    id: inner.id,
    calls: 0,
    async synthesize(text: string, voice: Parameters<TtsProvider['synthesize']>[1]) { t.calls++; return inner.synthesize(text, voice) },
  }
  return t
}

describe('FakeTts', () => {
  it('returns a wav as long as the estimated line duration', async () => {
    expect(wavSeconds(await new FakeTts().synthesize('một hai ba bốn năm sáu bảy tám', 'narrator'))).toBeGreaterThan(1)
  })
})

describe('cachedTts', () => {
  it('calls inner once for repeated text+voice, twice for a different voice', async () => {
    const inner = counting()
    const tts = cachedTts(inner, join(dir, 'cache'))
    await tts.synthesize('xin chào', 'narrator')
    await tts.synthesize('xin chào', 'narrator')
    expect(inner.calls).toBe(1)
    await tts.synthesize('xin chào', 'child')
    expect(inner.calls).toBe(2)
    expect(readdirSync(join(dir, 'cache')).filter((f) => f.endsWith('.wav'))).toHaveLength(2)
    expect(readdirSync(join(dir, 'cache')).filter((f) => f.includes('.tmp-'))).toHaveLength(0)
  })

  it('regenerates a truncated cache file', async () => {
    const inner = counting()
    const tts = cachedTts(inner, dir)
    const good = await tts.synthesize('xin chào', 'narrator')
    const [file] = readdirSync(dir)
    writeFileSync(join(dir, file!), good.subarray(0, 20))
    const again = await tts.synthesize('xin chào', 'narrator')
    expect(inner.calls).toBe(2)
    expect(wavSeconds(again)).toBeGreaterThan(0)
    expect(readFileSync(join(dir, file!)).length).toBe(good.length)
  })

  it('keeps the provider id', () => {
    expect(cachedTts(new FakeTts(), dir).id).toBe('fake')
  })

  it('does not reuse the cache across provider ids', async () => {
    const a = cachedTts({ id: 'a', synthesize: async () => silentWav(1) }, dir)
    const b = cachedTts({ id: 'b', synthesize: async () => silentWav(2) }, dir)
    await a.synthesize('x', 'narrator')
    expect(wavSeconds(await b.synthesize('x', 'narrator'))).toBeCloseTo(2, 3)
  })
})

describe.skipIf(process.platform !== 'darwin')('SayTts (macOS)', () => {
  it('speaks text beginning with "-" and containing $(rm) literally', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'say-cwd-'))
    const prev = process.cwd()
    process.chdir(cwd)
    try {
      const wav = await new SayTts().synthesize('-v Linh $(touch rm) xin chào', 'narrator')
      expect(wavSeconds(wav)).toBeGreaterThan(0.3)
      expect(readdirSync(cwd)).toEqual([])
      expect(existsSync(join(cwd, 'rm'))).toBe(false)
    } finally {
      process.chdir(prev)
      rmSync(cwd, { recursive: true, force: true })
    }
  }, 30_000)

  it('a faster voice rate gives a shorter clip', async () => {
    const text = 'Xin chào các bạn, hôm nay chúng ta học về phân số.'
    const [slow, fast] = await Promise.all([new SayTts().synthesize(text, 'male_old'), new SayTts().synthesize(text, 'child')])
    expect(wavSeconds(fast)).toBeLessThan(wavSeconds(slow))
  }, 30_000)
})
