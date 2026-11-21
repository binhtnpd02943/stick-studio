import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseScreenplay, type Screenplay, type TtsProvider } from '@stick/core'
import { FakeTts, wavSeconds } from '@stick/providers'
import { voiceScreenplay } from '../src/voice.js'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'voice-test-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks() })

const sp = (): Screenplay => {
  const r = parseScreenplay(JSON.parse(readFileSync(new URL('../../../examples/phan-so.screenplay.json', import.meta.url), 'utf8')))
  if (!r.ok) throw new Error(r.issues.join('; '))
  return r.value
}
const spoken = (s: Screenplay) => s.scenes.flatMap((sc) => sc.beats.filter((b) => b.say)).length

describe('voiceScreenplay', () => {
  it('writes one wav per spoken beat and returns their durations', async () => {
    const s = sp()
    const durations = await voiceScreenplay(s, new FakeTts(), dir)
    const files = readdirSync(dir).sort()
    expect(files).toHaveLength(spoken(s))
    expect(Object.keys(durations).map((id) => `${id}.wav`).sort()).toEqual(files)
    for (const f of files) expect(wavSeconds(readFileSync(join(dir, f)))).toBeCloseTo(durations[f.slice(0, -4)]!, 3)
  })

  it('uses the speaker voice and falls back to narrator with a warning', async () => {
    const s = sp()
    const voices: string[] = []
    const tts: TtsProvider = { id: 't', synthesize: async (text, v) => { voices.push(v); return new FakeTts().synthesize(text, v) } }
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const odd: Screenplay = { ...s, cast: s.cast.map((c, i) => (i === 0 ? { ...c, voice: 'robot' } : c)) }
    await voiceScreenplay(odd, tts, dir)
    expect(voices).toContain('narrator')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('robot'))
  })
})
