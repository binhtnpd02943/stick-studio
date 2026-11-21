import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TtsProvider } from '@stick/core'
import { cachedTts, FakeTts, neutraliseSayCommands, SayTts, silentWav, wavSeconds } from '../src/index.js'

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

describe('neutraliseSayCommands', () => {
  it.each(['[[', '[[[', '[[[[', 'a[[b[[c', '[[slnc 3000]]', 'plain [ text ]'])('leaves no adjacent [ in %j', (t) => {
    expect(neutraliseSayCommands(t)).not.toContain('[[')
  })
  it('keeps text without [[ unchanged', () => {
    expect(neutraliseSayCommands('xin chào [a] b')).toBe('xin chào [a] b')
  })
})

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

  it('regenerates a cache file cut in the middle of its data', async () => {
    const inner = counting()
    const tts = cachedTts(inner, dir)
    const good = await tts.synthesize('một hai ba bốn năm sáu bảy tám', 'narrator')
    const [file] = readdirSync(dir)
    writeFileSync(join(dir, file!), good.subarray(0, 44 + 1000))
    await tts.synthesize('một hai ba bốn năm sáu bảy tám', 'narrator')
    expect(inner.calls).toBe(2)
    expect(readFileSync(join(dir, file!)).length).toBe(good.length)
  })

  it('removes its temp file and rethrows when the write fails', async () => {
    mkdirSync(join(dir, 'x'))
    // a directory where the final file should go makes rename fail
    const probe = cachedTts({ id: 'p', synthesize: async () => silentWav(1) }, join(dir, 'x'))
    const hash = createHash('sha256').update('p\0narrator\0t').digest('hex')
    mkdirSync(join(dir, 'x', `${hash}.wav`))
    await expect(probe.synthesize('t', 'narrator')).rejects.toThrow()
    expect(readdirSync(join(dir, 'x')).filter((f) => f.includes('.tmp-'))).toEqual([])
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

  // the command is spoken as words (about 1.4 s) instead of obeyed (about +2.9 s of silence)
  it.each(['[[slnc 3000]] xin chào', '[[[slnc 3000]] xin chào'])('does not execute embedded speech commands in %s', async (text) => {
    const [plain, cmd] = await Promise.all([new SayTts().synthesize('slnc 3000 xin chào', 'narrator'), new SayTts().synthesize(text, 'narrator')])
    expect(Math.abs(wavSeconds(cmd) - wavSeconds(plain))).toBeLessThan(1)
  }, 30_000)

  it('a faster voice rate gives a shorter clip', async () => {
    const text = 'Xin chào các bạn, hôm nay chúng ta học về phân số.'
    const [slow, fast] = await Promise.all([new SayTts().synthesize(text, 'male_old'), new SayTts().synthesize(text, 'child')])
    expect(wavSeconds(fast)).toBeLessThan(wavSeconds(slow))
  }, 30_000)
})
