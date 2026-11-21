import type { BackdropDef } from '../types'

export const classroom: BackdropDef = {
  id: 'classroom',
  version: 1,
  description: 'Faint classroom wall: a window frame on the left and a clock on the right.',
  draw(g, rig, t) {
    const { C, rr, inkFill, ln } = rig
    // window
    rr(g, -130, -170, 56, 46, 3)
    inkFill(g, null, 1.4, C.faint)
    ln(g, -102, -170, -102, -124, 1.2, C.faint)
    ln(g, -130, -147, -74, -147, 1.2, C.faint)
    // clock
    const cx = 100, cy = -150, r = 14
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    inkFill(g, null, 1.4, C.faint)
    const a = -Math.PI / 2 + t * 0.05
    ln(g, cx, cy, cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), 1.4, C.muted)
    ln(g, cx, cy, cx + Math.cos(a / 12) * (r - 7), cy + Math.sin(a / 12) * (r - 7), 1.4, C.muted)
  },
}
