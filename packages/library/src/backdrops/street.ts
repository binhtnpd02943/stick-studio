import type { BackdropDef } from '../types'

const BUILDINGS: ReadonlyArray<readonly [x: number, w: number, top: number]> = [[-148, 46, -170], [-98, 36, -140], [-58, 40, -176], [60, 38, -150], [102, 46, -178]]

export const street: BackdropDef = {
  id: 'street',
  version: 1,
  description: 'Faint street: building silhouettes with windows on both sides and a lamp post far back.',
  draw(g, rig) {
    const { C, rr, inkFill, ln } = rig
    for (const [x, w, top] of BUILDINGS) {
      rr(g, x, top, w, -2 - top, 0)
      inkFill(g, C.line, 1.4, C.faint)
      for (let y = top + 10; y < -24; y += 18) for (let wx = x + 7; wx < x + w - 9; wx += 14) {
        rr(g, wx, y, 7, 9, 0.5)
        inkFill(g, null, 1.1, C.faint)
      }
    }
    ln(g, 30, -2, 30, -148, 2, C.faint) // lamp post
    ln(g, 30, -148, 42, -148, 2, C.faint)
    rr(g, 38, -151, 9, 5, 1.5)
    inkFill(g, C.butterSoft, 1.2, C.faint)
  },
}
