import type { BackdropDef } from '../types'

const LAMPS = [-60, 0, 60]

export const cafe: BackdropDef = {
  id: 'cafe',
  version: 1,
  description: 'Faint cafe: a menu board on the left, three pendant lamps hanging above and a counter line along the back.',
  draw(g, rig) {
    const { C, rr, inkFill, ln, poly, words } = rig
    rr(g, -134, -178, 52, 40, 3) // menu board
    inkFill(g, null, 1.4, C.faint)
    for (let i = 0; i < 4; i++) words(g, -128, -168 + i * 8, 40, i * 5 + 1, C.faint, 1.4)
    for (const x of LAMPS) {
      ln(g, x, -184, x, -160, 1.2, C.faint)
      poly(g, [[x - 6, -160], [x + 6, -160], [x + 11, -148], [x - 11, -148]], true)
      inkFill(g, C.butterSoft, 1.3, C.faint)
    }
    ln(g, -148, -46, 148, -46, 1.4, C.faint) // counter
    ln(g, -148, -42, 148, -42, 1.4, C.faint)
  },
}
