import type { BackdropDef } from '../types'

export const home: BackdropDef = {
  id: 'home',
  version: 1,
  description: 'Faint living-room wall: a window with curtains on the left and a picture frame on the right.',
  draw(g, rig) {
    const { C, rr, inkFill, ln, poly } = rig
    rr(g, -126, -170, 46, 42, 3) // window
    inkFill(g, null, 1.4, C.faint)
    ln(g, -103, -170, -103, -128, 1.2, C.faint)
    ln(g, -126, -149, -80, -149, 1.2, C.faint)
    for (const x of [-136, -82]) {
      rr(g, x, -176, 14, 54, 3) // curtains
      inkFill(g, C.line, 1.4, C.faint)
      ln(g, x + 7, -174, x + 7, -124, 1.1, C.faint)
    }
    rr(g, 70, -168, 34, 28, 2) // picture frame with a hill and a sun
    inkFill(g, null, 1.6, C.faint)
    poly(g, [[75, -145], [85, -158], [91, -151], [95, -156], [99, -145]], false)
    inkFill(g, null, 1.2, C.faint)
    rr(g, 112, -160, 18, 22, 2)
    inkFill(g, null, 1.4, C.faint)
  },
}
