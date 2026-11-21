import { createCanvas } from '@napi-rs/canvas'
import { loadRig } from '@stick/engine'
import { defaultCatalog } from '@stick/library'
import { describe, expect, test } from 'vitest'
import { STAGE } from '../src/index.js'

// A canvas wider and taller than the stage (same scale), so ink drawn off-stage is seen, not clipped.
const WORLD = { x0: -250, x1: 250, y0: -260, y1: 40 }
const W = (WORLD.x1 - WORLD.x0) * STAGE.scale
const H = (WORLD.y1 - WORLD.y0) * STAGE.scale
const TOP = -185
const HALF_STAGE = STAGE.worldWidth / 2
const SLACK = 3 // stroke width and anti-aliasing past a prop's nominal width
const MIN_INK = 0.01
const TIMES = [0, 1.5, 9]

const PROPS: Record<string, { width: number; seatY?: number }> = {
  chair: { width: 34, seatY: -30 }, sofa: { width: 90, seatY: -28 }, bed: { width: 110, seatY: -32 },
  table: { width: 70 }, door: { width: 44 }, tree: { width: 70 }, bookshelf: { width: 60 }, box: { width: 40 }, lamp: { width: 30 }, plant: { width: 30 },
}
const BACKDROPS = ['blank', 'classroom', 'home', 'office', 'street', 'park', 'cafe', 'stage']

const rig = loadRig()
const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)
}
const FAINTEST_ALLOWED = lum(rig.C.muted) - 1 // 8-bit rounding of the muted grey itself

interface Ink { minX: number; maxX: number; minY: number; maxY: number; area: number; darkest: number }

/** Draw alone on a transparent canvas through the stage transform; report the inked extent in world units. */
function inkOf(draw: (g: CanvasRenderingContext2D) => void): Ink {
  const g = createCanvas(W, H).getContext('2d')
  g.scale(STAGE.scale, STAGE.scale)
  g.translate(-WORLD.x0, -WORLD.y0)
  draw(g as unknown as CanvasRenderingContext2D)
  const data = g.getImageData(0, 0, W, H).data
  const ink: Ink = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, area: 0, darkest: 255 }
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255
    if (a === 0) continue
    const p = i / 4
    const x = ((p % W) + 0.5) / STAGE.scale + WORLD.x0
    const y = (Math.floor(p / W) + 0.5) / STAGE.scale + WORLD.y0
    ink.minX = Math.min(ink.minX, x); ink.maxX = Math.max(ink.maxX, x)
    ink.minY = Math.min(ink.minY, y); ink.maxY = Math.max(ink.maxY, y)
    ink.area += 1 / (STAGE.scale * STAGE.scale)
    const over = (c: number) => c * a + 255 * (1 - a) // composited on white paper
    ink.darkest = Math.min(ink.darkest, 0.2126 * over(data[i]!) + 0.7152 * over(data[i + 1]!) + 0.0722 * over(data[i + 2]!))
  }
  return ink
}

describe('catalog ids', () => {
  test('props have the specified width and seatY', () => {
    expect(Object.keys(defaultCatalog.props).sort()).toEqual(['desk', 'whiteboard', ...Object.keys(PROPS)].sort())
    for (const [id, want] of Object.entries(PROPS)) {
      expect(defaultCatalog.props[id]?.width, id).toBe(want.width)
      expect(defaultCatalog.props[id]?.seatY, id).toBe(want.seatY)
    }
  })

  test('backdrops are the 8 specified', () => {
    expect(Object.keys(defaultCatalog.backdrops).sort()).toEqual([...BACKDROPS].sort())
  })

  test('every prop and backdrop has a one-line description', () => {
    for (const d of [...Object.values(defaultCatalog.props), ...Object.values(defaultCatalog.backdrops)]) {
      expect(d.description.length, d.id).toBeGreaterThan(10)
      expect(d.description.length, d.id).toBeLessThanOrEqual(160)
    }
  })
})

describe('props stay on their patch of stage', () => {
  for (const p of Object.values(defaultCatalog.props)) {
    test(p.id, () => {
      for (const t of TIMES) {
        const ink = inkOf((g) => p.draw(g, rig, 0, t))
        expect(ink.minX, `${p.id} t=${t} left`).toBeGreaterThanOrEqual(-p.width / 2 - SLACK)
        expect(ink.maxX, `${p.id} t=${t} right`).toBeLessThanOrEqual(p.width / 2 + SLACK)
        expect(ink.minY, `${p.id} t=${t} top`).toBeGreaterThanOrEqual(TOP)
        expect(ink.maxY, `${p.id} t=${t} base`).toBeLessThanOrEqual(1)
        expect(ink.area, `${p.id} t=${t} ink`).toBeGreaterThanOrEqual(MIN_INK * p.width * -TOP)
      }
    })
  }
})

describe('backdrops stay on stage and faint', () => {
  for (const b of Object.values(defaultCatalog.backdrops)) {
    test(b.id, () => {
      for (const t of TIMES) {
        const ink = inkOf((g) => b.draw(g, rig, t))
        if (b.id === 'blank') { expect(ink.area).toBe(0); continue }
        expect(ink.minX, `${b.id} t=${t} left`).toBeGreaterThanOrEqual(-HALF_STAGE)
        expect(ink.maxX, `${b.id} t=${t} right`).toBeLessThanOrEqual(HALF_STAGE)
        expect(ink.minY, `${b.id} t=${t} top`).toBeGreaterThanOrEqual(TOP)
        expect(ink.maxY, `${b.id} t=${t} base`).toBeLessThanOrEqual(0)
        expect(ink.darkest, `${b.id} t=${t} too dark`).toBeGreaterThanOrEqual(FAINTEST_ALLOWED)
      }
    })
  }
})
