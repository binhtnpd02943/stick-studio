import { createCanvas } from '@napi-rs/canvas'
import { loadRig, registerFonts } from '@stick/engine'
import { describe, expect, it } from 'vitest'
import { defaultCatalog } from '../src/index'
import type { ActionContext, ActionDef } from '../src/index'

const rig = loadRig()
const base = rig.breathe(rig.P({ hF: [12, -60], hB: [-4, -52] }), 0.4)

function ctxAt(def: ActionDef, T: number, over: Partial<ActionContext> = {}): ActionContext {
  const dur = def.duration.ideal
  return {
    rig,
    self: { id: 'a', x: -95, facing: 1 },
    targetX: def.needsTarget ? 50 : undefined,
    k: T / dur,
    T,
    dur,
    t: 3.7 + T,
    base,
    ...over,
  }
}

const actions = Object.values(defaultCatalog.actions)
const near = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) <= 1

describe('actions', () => {
  it('catalog ids are exact', () => {
    expect(Object.keys(defaultCatalog.actions).sort()).toEqual([
      'bow', 'cheer', 'clap', 'cross_arms', 'cry', 'dance', 'drink', 'facepalm', 'fall_down', 'hug', 'jump', 'knock', 'laugh',
      'look_around', 'nod', 'phone_call', 'point_at', 'push', 'read_book', 'run_to', 'scratch_head', 'shake_head', 'shrug',
      'sit', 'sleep', 'stomp', 'talk', 'think', 'type_laptop', 'walk_to', 'wave',
    ])
    expect(Object.keys(defaultCatalog.props).sort()).toEqual(['desk', 'whiteboard'])
    expect(Object.keys(defaultCatalog.backdrops).sort()).toEqual(['blank', 'classroom'])
  })

  it.each(actions.map((a) => [a.id, a] as const))('%s starts at rest at k=0', (_id, def) => {
    expect(near(def.apply(ctxAt(def, 0)).pose.hF, base.hF)).toBe(true)
  })

  it.each(actions.filter((a) => a.id !== 'walk_to').map((a) => [a.id, a] as const))('%s returns to rest at k=1', (_id, def) => {
    expect(near(def.apply(ctxAt(def, def.duration.ideal)).pose.hF, base.hF)).toBe(true)
  })

  it.each(actions.filter((a) => a.id !== 'walk_to').map((a) => [a.id, a] as const))('%s actually moves mid-action', (_id, def) => {
    const moved = [0.25, 0.5, 0.75].flatMap((k) => {
      const pose = def.apply(ctxAt(def, def.duration.ideal * k)).pose
      return (['hF', 'hB', 'head'] as const).map((j) => Math.hypot(pose[j][0] - base[j][0], pose[j][1] - base[j][1]))
    })
    expect(Math.max(...moved)).toBeGreaterThan(2)
  })

  // The contract: ramp in/out over at least 0.3 s. A soft 0.3 s ramp is 25% done at 0.1 s (arm arcs run a little ahead); a 0.18 s ramp is 62% done.
  // walk_to is locomotion, nod is a full oscillation from rest and talk may be 0.3 s long, so they are not ramped by contract.
  it.each(
    actions.filter((a) => !['walk_to', 'nod', 'talk'].includes(a.id)).flatMap((a) => (['min', 'ideal'] as const).map((w) => [`${a.id} at ${w}`, a, a.duration[w]] as const)),
  )('%s is at rest at both ends and has not snapped by T=0.1s', (_name, def, dur) => {
    const at = (T: number) => def.apply(ctxAt(def, T, { dur, k: T / dur })).pose
    const dist = (T: number) => Math.max(...(['hF', 'hB', 'head', 'hip', 'fF', 'fB'] as const).map((j) => Math.hypot(at(T)[j][0] - base[j][0], at(T)[j][1] - base[j][1])))
    const frames = Array.from({ length: 61 }, (_, i) => (dur * i) / 60)
    const peak = Math.max(...frames.map(dist))
    expect(dist(0)).toBeLessThan(1)
    expect(dist(dur)).toBeLessThan(1)
    expect(dist(0.1)).toBeLessThanOrEqual(0.45 * peak + 0.5)
  })

  // Task 6 gives chair/sofa/bed seatY -30/-28/-32 (world): the seated hip must sit on that, within a few units.
  it('sit puts the hip on the seat surface and holds it there', () => {
    const def = defaultCatalog.actions.sit!
    const hipY = def.apply(ctxAt(def, def.duration.ideal / 2, { targetX: -60 })).pose.hip[1] * rig.FS
    for (const seatY of [-30, -28, -32]) expect(Math.abs(hipY - seatY)).toBeLessThan(5)
  })

  it('sit moves the hip over the seat, facing it, and the feet follow', () => {
    const def = defaultCatalog.actions.sit!
    const r = def.apply(ctxAt(def, def.duration.ideal / 2, { targetX: -60 }))
    expect(r.facing).toBe(1)
    expect(r.pose.hip[0] * rig.FS).toBeCloseTo(35, 0)
    expect(r.pose.fF[0]).toBeGreaterThan(r.pose.hip[0])
  })

  it('fall_down ends lying and gets up', () => {
    const def = defaultCatalog.actions.fall_down!
    const lying = def.apply(ctxAt(def, def.duration.ideal / 2)).pose
    expect(lying.head[1]).toBeGreaterThan(-25)
    expect(lying.chest[1]).toBeGreaterThan(-25)
  })

  it('walk_to arrives', () => {
    const def = defaultCatalog.actions.walk_to!
    const end = def.apply(ctxAt(def, 1.2, { dur: 1.2, targetX: 50 }))
    expect(end.x).toBe(50)
    expect(end.facing).toBe(1)
    const mid = def.apply(ctxAt(def, 0.6, { dur: 1.2, targetX: 50 }))
    expect(mid.x!).toBeGreaterThan(-95)
    expect(mid.x!).toBeLessThan(50)
    expect(mid.gait?.stride).toBeGreaterThan(0)
  })

  it('walk_to faces left when the target is to the left', () => {
    const def = defaultCatalog.actions.walk_to!
    expect(def.apply(ctxAt(def, 0.5, { dur: 1.2, targetX: -150 })).facing).toBe(-1)
  })

  it('props and backdrops draw without throwing', () => {
    registerFonts()
    const g = createCanvas(380, 230).getContext('2d') as unknown as CanvasRenderingContext2D
    g.translate(190, 192)
    for (const b of Object.values(defaultCatalog.backdrops)) expect(() => b.draw(g, rig, 1.5)).not.toThrow()
    for (const p of Object.values(defaultCatalog.props)) expect(() => p.draw(g, rig, 20, 1.5)).not.toThrow()
  })
})
