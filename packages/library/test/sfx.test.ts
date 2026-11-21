import { loadRig } from '@stick/engine'
import { describe, expect, it } from 'vitest'
import { defaultCatalog } from '../src/index'
import type { ActionDef } from '../src/index'

const rig = loadRig()
const base = rig.breathe(rig.P({ hF: [12, -60], hB: [-4, -52] }), 0.4)
const act = (id: string): ActionDef => defaultCatalog.actions[id]!
const cues = (id: string, dur: number, distance = 0) => act(id).sfx!(dur, { rig, distance })
const apply = (id: string, T: number, dur: number) =>
  act(id).apply({ rig, self: { id: 'a', x: -95, facing: 1 }, targetX: 95, k: T / dur, T, dur, t: 1 + T, base })

describe('action sfx', () => {
  it('names exactly the actions that make sound', () => {
    const withSfx = Object.values(defaultCatalog.actions).filter((a) => a.sfx).map((a) => a.id).sort()
    expect(withSfx).toEqual(['cheer', 'clap', 'fall_down', 'jump', 'knock', 'run_to', 'scratch_head', 'think', 'walk_to'])
  })

  it('every cue falls inside the action at min, ideal and max duration', () => {
    for (const a of Object.values(defaultCatalog.actions).filter((d) => d.sfx)) {
      for (const dur of [a.duration.min, a.duration.ideal, a.duration.max]) {
        const found = a.sfx!(dur, { rig, distance: (a.speed ?? 0) * dur })
        expect(found.length, `${a.id}@${dur}`).toBeGreaterThan(0)
        for (const c of found) expect(c.at, `${a.id}@${dur}`).toBeGreaterThan(0), expect(c.at).toBeLessThanOrEqual(dur)
      }
    }
  })

  it.each(['walk_to', 'run_to'])('%s steps land when both feet are on the ground', (id) => {
    const dur = id === 'walk_to' ? 2 : 1
    const found = cues(id, dur, 190)
    expect(found.length).toBeGreaterThan(2)
    for (const { at } of found) {
      const { gait } = apply(id, at, dur)
      const p = rig.legs(base, gait!.ph, gait!.amp, { stride: gait!.stride })
      expect(p.fF[1], `${id} @${at}`).toBeCloseTo(-2.5, 0)
      expect(p.fB[1], `${id} @${at}`).toBeCloseTo(-2.5, 0)
    }
  })

  it('clap cues land when the hands meet, not at their widest', () => {
    const gap = (T: number) => { const p = apply('clap', T, 1.5).pose; return Math.hypot(p.hF[0] - p.hB[0], p.hF[1] - p.hB[1]) }
    const found = cues('clap', 1.5)
    expect(found.length).toBeGreaterThanOrEqual(2)
    for (const { at } of found) expect(gap(at)).toBeLessThan(gap(at + 1 / 6) * 0.5)
  })

  it('jump whoosh is at take-off and thud at touch-down, with the body lifted between', () => {
    const [up, down] = cues('jump', 1.2)
    const lift = (T: number) => apply('jump', T, 1.2).pose.head[1]
    expect(up!.id).toBe('whoosh')
    expect(down!.id).toBe('thud')
    expect(lift((up!.at + down!.at) / 2)).toBeLessThan(lift(up!.at) - 10)
    expect(Math.abs(lift(down!.at) - lift(up!.at))).toBeLessThan(5) // both feet are on the ground (the rise is zero at either end)
  })

  it('fall_down thud lands when the body is flat', () => {
    const [thud] = cues('fall_down', 1.8)
    const head = (T: number) => apply('fall_down', T, 1.8).pose.head[1]
    expect(Math.abs(head(thud!.at) - head(thud!.at + 0.2))).toBeLessThan(1)
  })

  it('knock lands twice, where the impact flick is drawn', () => {
    expect(cues('knock', 1.2).map((c) => c.id)).toEqual(['knock', 'knock'])
    expect(cues('knock', 1.2).map((c) => c.at)).toEqual([0.3 + 0.3, 0.3 + 0.6].map((x) => expect.closeTo(x, 6)))
  })

  it('cheer pops at the top of the Y; think and scratch_head ting at 40%', () => {
    const [pop] = cues('cheer', 1)
    const hand = (T: number) => apply('cheer', T, 1).pose.hF[1]
    expect(hand(pop!.at)).toBeLessThan(hand(pop!.at - 0.15) - 5)
    expect(cues('think', 2)).toEqual([{ id: 'ting', at: 0.8 }])
    expect(cues('scratch_head', 2)).toEqual([{ id: 'ting', at: 0.8 }])
  })
})
