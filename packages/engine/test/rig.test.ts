import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { loadRig } from '../src/index'

const REST = { hF: [12, -60], hB: [-4, -52] }

function drawResting(rig: ReturnType<typeof loadRig>) {
  const canvas = createCanvas(380, 230)
  const g = canvas.getContext('2d')
  g.translate(190, 192)
  rig.fig(g, rig.breathe(rig.P(REST), 0), 0, 0)
  return canvas
}

describe('rig', () => {
  it('draws a resting figure', () => {
    const canvas = drawResting(loadRig())
    const [r, g, b] = canvas.getContext('2d').getImageData(190, Math.round(192 - 102 * 0.88), 1, 1).data
    expect(Math.max(r!, g!, b!)).toBeLessThan(60)
  })

  it('is deterministic', () => {
    const a = drawResting(loadRig()).toBuffer('image/png')
    const b = drawResting(loadRig()).toBuffer('image/png')
    expect(a.equals(b)).toBe(true)
  })

  it('instrument records joints', () => {
    const rig = loadRig({ instrument: true })
    const rec: Array<{ hc: number[] }> = []
    rig.__shim.__rec = rec
    drawResting(rig)
    expect(rec).toHaveLength(1)
    expect(rec[0]!.hc).toHaveLength(2)
    expect(rec[0]!.hc.every((n) => typeof n === 'number')).toBe(true)
  })
})
