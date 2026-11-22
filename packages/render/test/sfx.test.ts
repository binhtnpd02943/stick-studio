import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { wavSeconds } from '@stick/core'
import { loadRig } from '@stick/engine'
import { defaultCatalog } from '@stick/library'
import { describe, expect, test } from 'vitest'
import { ensureSfx, sfxCues, SFX_IDS, soloTimeline, type SfxId } from '../src/index.js'

const DURATIONS: Record<SfxId, number> = { step: 0.08, pop: 0.12, whoosh: 0.35, ting: 0.6, thud: 0.25, clap: 0.1, knock: 0.12 }
const tmp = mkdtempSync(join(tmpdir(), 'stick-sfx-'))

describe('ensureSfx', () => {
  test('is byte-identical across two generations', async () => {
    const dir = join(tmp, 'twice')
    for (const id of SFX_IDS) {
      const first = readFileSync(await ensureSfx(id, dir))
      rmSync(dir, { recursive: true, force: true })
      expect(readFileSync(await ensureSfx(id, dir)).equals(first), id).toBe(true)
    }
  })

  test('each id has the stated duration ±10 ms', async () => {
    for (const id of SFX_IDS) {
      expect(Math.abs(wavSeconds(readFileSync(await ensureSfx(id, join(tmp, 'dur')))) - DURATIONS[id]), id).toBeLessThanOrEqual(0.01)
    }
  })

  test('reuses a cached file instead of regenerating it', async () => {
    const dir = join(tmp, 'cache')
    const path = await ensureSfx('pop', dir)
    expect(path).toMatch(/pop@1\.wav$/)
    expect(await ensureSfx('pop', dir, { ffmpegPath: '/nonexistent/ffmpeg' })).toBe(path)
  })

  test('concurrent ensureSfx calls for one id all resolve to a valid wav and leave no partial files', async () => {
    const dir = join(tmp, 'concurrent')
    const paths = await Promise.all(Array.from({ length: 4 }, () => ensureSfx('ting', dir)))
    expect(new Set(paths).size).toBe(1)
    expect(Math.abs(wavSeconds(readFileSync(paths[0]!)) - 0.6)).toBeLessThanOrEqual(0.01)
    expect(readdirSync(dir)).toEqual(['ting@1.wav'])
  })

  test('a failing ffmpeg leaves no partial file behind', async () => {
    const dir = join(tmp, 'broken')
    await expect(ensureSfx('pop', dir, { ffmpegPath: '/nonexistent/ffmpeg' })).rejects.toThrow()
    await expect(ensureSfx('pop', dir)).resolves.toBeTruthy()
  })
})

describe('sfxCues', () => {
  test('a walk_to solo has one step per footfall, inside the track', () => {
    const dur = 2
    const tl = soloTimeline('walk_to', dur, 'right')
    const cues = sfxCues(tl, defaultCatalog)
    const rig = loadRig()
    const expected = Math.floor(rig.walkSeg(dur, 0, dur, -95, 95).ph * 2 + 1e-6)
    expect(expected).toBeGreaterThan(2)
    expect(cues).toHaveLength(expected)
    for (const c of cues) {
      expect(c.id).toBe('step')
      expect(c.start).toBeGreaterThan(0)
      expect(c.start).toBeLessThanOrEqual(dur)
    }
    expect(cues.map((c) => c.start)).toEqual([...cues.map((c) => c.start)].sort((a, b) => a - b))
  })

  test('is deterministic and offset by the track start', () => {
    const tl = soloTimeline('jump', 1)
    expect(sfxCues(tl, defaultCatalog)).toEqual(sfxCues(tl, defaultCatalog))
    const shifted = structuredClone(tl)
    for (const t of shifted.scenes[0]!.beats[0]!.tracks) { t.start += 3; t.end += 3 }
    shifted.duration += 3
    const a = sfxCues(tl, defaultCatalog), b = sfxCues(shifted, defaultCatalog)
    expect(a.map((c) => c.id)).toEqual(['whoosh', 'thud'])
    expect(b.map((c) => c.start)).toEqual(a.map((c) => c.start + 3))
  })

  test('cues are clamped to the film duration', () => {
    const tl = { ...soloTimeline('jump', 1), duration: 0.4 }
    for (const c of sfxCues(tl, defaultCatalog)) expect(c.start).toBeLessThanOrEqual(0.4)
  })

  test('actions with no sound produce no cues', () => expect(sfxCues(soloTimeline('wave', 1.5), defaultCatalog)).toEqual([]))
})
