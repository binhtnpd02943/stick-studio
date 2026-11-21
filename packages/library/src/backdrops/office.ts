import type { BackdropDef } from '../types'

export const office: BackdropDef = {
  id: 'office',
  version: 1,
  description: 'Faint office wall: a window with blinds on the left, a wall clock in the middle and a calendar on the right.',
  draw(g, rig, t) {
    const { C, rr, inkFill, ln, circle } = rig
    rr(g, -134, -176, 58, 52, 3) // window with blinds
    inkFill(g, null, 1.4, C.faint)
    for (let y = -170; y < -126; y += 6) ln(g, -131, y, -79, y, 1.3, C.faint)
    const cx = 0, cy = -158, r = 13 // clock, hands move like classroom's
    circle(g, cx, cy, r)
    inkFill(g, null, 1.4, C.faint)
    const a = -Math.PI / 2 + t * 0.05
    ln(g, cx, cy, cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), 1.4, C.muted)
    ln(g, cx, cy, cx + Math.cos(a / 12) * (r - 7), cy + Math.sin(a / 12) * (r - 7), 1.4, C.muted)
    rr(g, 86, -176, 34, 42, 2) // calendar
    inkFill(g, null, 1.4, C.faint)
    ln(g, 86, -164, 120, -164, 1.2, C.faint)
    for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 4; c++) ln(g, 91 + c * 8, -156 + r2 * 8, 94 + c * 8, -156 + r2 * 8, 1.6, C.faint)
  },
}
