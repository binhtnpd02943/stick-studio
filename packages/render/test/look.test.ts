import { createCanvas } from '@napi-rs/canvas'
import { loadRig, type Pose } from '@stick/engine'
import { defaultCatalog } from '@stick/library'
import { describe, expect, test, vi } from 'vitest'
import { drawHair, jointWorld } from '../src/look.js'

const REST = { hF: [12, -60], hB: [-4, -52] }
const SZ = 240
const ORIGIN = { x: 120, y: 190, k: 1.5 } // canvas px of world (0, 0) and px per world unit

function pose(rig: ReturnType<typeof loadRig>): Pose {
  return rig.legs(rig.breathe(rig.P(REST), 0), 0, 0, { arms: false }) as Pose
}

function render(hair: Parameters<typeof drawHair>[5], facing: 1 | -1 = 1, t = 0) {
  const rig = loadRig()
  const p = pose(rig)
  const g = createCanvas(SZ, SZ).getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, SZ, SZ)
  g.translate(ORIGIN.x, ORIGIN.y)
  g.scale(ORIGIN.k, ORIGIN.k)
  rig.fig(g, p, 0, 0, { sx: facing })
  drawHair(g, rig, p, 0, facing, hair, rig.C.ink, t)
  return { data: g.getImageData(0, 0, SZ, SZ).data, p }
}

function changed(a: Uint8ClampedArray, b: Uint8ClampedArray): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) out.push([(i / 4) % SZ, Math.floor(i / 4 / SZ)])
  return out
}

describe('jointWorld', () => {
  test('mirrors x with facing', () => {
    const p = pose(loadRig())
    for (const j of ['head', 'hF', 'hB', 'chest', 'hip'] as const) {
      const [rx, ry] = jointWorld(p, j, 50, 1)
      const [lx, ly] = jointWorld(p, j, 50, -1)
      expect(lx - 50).toBeCloseTo(-(rx - 50))
      expect(ly).toBeCloseTo(ry)
    }
  })

  test('head matches the head fig draws', () => {
    const rig = loadRig({ instrument: true })
    const rec: Array<{ x: number; y: number; s: number; sx: number; hc: [number, number] }> = []
    rig.__shim.__rec = rec
    const p = pose(rig)
    const g = createCanvas(SZ, SZ).getContext('2d')
    rig.fig(g, p, 30, 0, { sx: -1 })
    const r = rec[0]!
    const [x, y] = jointWorld(p, 'head', 30, -1)
    expect(x).toBeCloseTo(r.x + r.hc[0] * r.s * r.sx)
    expect(y).toBeCloseTo(r.y + r.hc[1] * r.s)
  })
})

describe('drawHair', () => {
  const none = render('none')

  test.each(['short', 'long', 'ponytail'] as const)('%s changes pixels in the head region and nowhere below the shoulders', (hair) => {
    const { data, p } = render(hair)
    const diff = changed(none.data, data)
    expect(diff.length).toBeGreaterThan(20)
    const [, chestY] = jointWorld(p, 'chest', 0, 1)
    const [headX, headY] = jointWorld(p, 'head', 0, 1)
    for (const [px, py] of diff) {
      expect(py).toBeLessThanOrEqual(ORIGIN.y + chestY * ORIGIN.k)
      expect(Math.abs(px - (ORIGIN.x + headX * ORIGIN.k))).toBeLessThan(25 * ORIGIN.k)
      expect(py).toBeGreaterThan(ORIGIN.y + headY * ORIGIN.k - 25 * ORIGIN.k)
    }
  })

  test('none draws nothing', () => {
    expect(changed(none.data, render('none', 1, 1.3).data)).toHaveLength(0)
  })

  test('long and ponytail differ', () => {
    expect(changed(render('long').data, render('ponytail').data).length).toBeGreaterThan(0)
  })

  test('ponytail swings with t', () => {
    expect(changed(render('ponytail', 1, 0).data, render('ponytail', 1, Math.PI / 2).data).length).toBeGreaterThan(0)
  })

  test('mirrors with facing', () => {
    const a = render('ponytail', 1).data
    const b = render('ponytail', -1).data
    const noneL = render('none', -1).data
    const right = changed(none.data, a).map(([x]) => x - ORIGIN.x)
    const left = changed(noneL, b).map(([x]) => ORIGIN.x - x)
    expect(Math.min(...right)).toBeLessThan(0) // ponytail trails behind the facing-right head
    expect(Math.min(...left)).toBeLessThan(0)
  })
})

describe('whiteboard', () => {
  test('draws no text', () => {
    const rig = loadRig()
    const spy = vi.spyOn(rig, 'text')
    const g = createCanvas(SZ, SZ).getContext('2d')
    defaultCatalog.props.whiteboard!.draw(g as unknown as CanvasRenderingContext2D, rig, 0, 0)
    expect(spy).not.toHaveBeenCalled()
  })
})
