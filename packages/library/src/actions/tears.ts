import type { Rig } from '@stick/engine'
import type { OverlayAt } from '../types'

const TEAR_COLOUR = '#5aa9e6'
const DROPS = 4
const FALL_S = 0.9 // seconds for a drop to run its course
const FALL_PX = 34 // how far it falls, world units
const EYE = { fwd: 6, down: 1 } // from the head centre; the figure is in profile, so one eye
const RADIUS = 2

/** Small tear drops falling from the eye, a pure function of `t`. `w` (0..1) fades the stream in and out with the action. */
export function drawTears(g: CanvasRenderingContext2D, _rig: Rig, at: OverlayAt, w: number): void {
  const ex = at.head[0] + at.facing * EYE.fwd
  const ey = at.head[1] + EYE.down
  g.save()
  g.fillStyle = TEAR_COLOUR
  for (let i = 0; i < DROPS; i++) {
    const f = (at.t / FALL_S + i / DROPS) % 1
    g.globalAlpha = Math.min(1, w * 1.5) * (1 - f * f)
    g.beginPath()
    g.ellipse(ex + at.facing * (i % 2) * 2.2, ey + f * FALL_PX, RADIUS * 0.8, RADIUS * (1 + f * 0.3), 0, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}
