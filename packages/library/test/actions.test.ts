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
    expect(Object.keys(defaultCatalog.actions).sort()).toEqual(['cheer', 'nod', 'point_at', 'talk', 'think', 'walk_to', 'wave'])
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
