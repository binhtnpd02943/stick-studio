import type { Rig } from '@stick/engine'

const BASE_W = 28
const LID_W = 22
const LID_H = 22

/** A laptop seen from the front, so it reads the same to a typist on either side; sits on a surface at `top`. */
export function drawLaptop(g: CanvasRenderingContext2D, rig: Rig, x: number, top: number): void {
  const { C, rr, inkFill } = rig
  rr(g, x - LID_W / 2, top - 4 - LID_H, LID_W, LID_H, 2) // lid, back to us
  inkFill(g, '#2b2b2b', 1.4)
  rr(g, x - BASE_W / 2, top - 4, BASE_W, 4, 1.5)
  inkFill(g, C.steel, 1.4)
}
