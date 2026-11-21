import type { SKRSContext2D } from '@napi-rs/canvas'
import type { Pose, Rig } from '@stick/engine'

export type Hair = 'short' | 'long' | 'ponytail' | 'none'
export type Joint = 'head' | 'hF' | 'hB' | 'chest' | 'hip'

const HEAD_R = 7.8 // vendored rig constant (not exported); look.test checks the head position, not this radius
const NECK = 20.5 // chest to head centre, as in rig.fig
const STRAND_END = 17 // below the head centre; the shoulder line is NECK down
const HAIR_W = 2.2
const TAIL_SWING = 2 // world units
const CAP_W = 3.2 // the cap hugs the head, so it must be thick to show beyond the ink disc

/** Head centre in pose space, as rig.fig computes it: NECK along chest -> head. */
function headCentre(pose: Pose): { hc: [number, number]; angle: number } {
  const dx = pose.head[0] - pose.chest[0]
  const dy = pose.head[1] - pose.chest[1]
  const l = Math.hypot(dx, dy) || 1
  return { hc: [pose.chest[0] + (dx / l) * NECK, pose.chest[1] + (dy / l) * NECK], angle: Math.atan2(dy, dx) + Math.PI / 2 }
}

/**
 * World position of a rig joint, mirrored by `facing` exactly as rig.fig does (x + q.x * FS * sx, q.y * FS).
 * Hands are the pose targets; fig may reach or clear them slightly, so use fig's own J.w for exact hands.
 */
export function jointWorld(pose: Pose, joint: Joint, x: number, facing: 1 | -1, fs = 0.88): [number, number] {
  const q = joint === 'head' ? headCentre(pose).hc : pose[joint]
  return [x + q[0] * fs * facing, q[1] * fs]
}

function stroke(g: SKRSContext2D, ink: string, fn: () => void, width = HAIR_W): void {
  g.strokeStyle = ink
  g.lineWidth = width
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  fn()
  g.stroke()
}

/** Hair in the head's frame: origin at the head centre, up is -y, the face looks toward +x. */
function drawLocal(g: SKRSContext2D, hair: Exclude<Hair, 'none'>, ink: string, t: number): void {
  const R = HEAD_R
  stroke(g, ink, () => g.arc(0, 0, R + CAP_W / 2 - 0.5, Math.PI * 1.04, Math.PI * 1.96), CAP_W)
  if (hair === 'long') {
    for (const side of [-1, 1]) {
      stroke(g, ink, () => {
        g.moveTo(side * R * 0.95, -2)
        g.quadraticCurveTo(side * (R + 3.5), 6, side * (R + 1), STRAND_END)
      })
    }
  }
  if (hair === 'ponytail') {
    const sway = Math.sin(t) * TAIL_SWING
    stroke(g, ink, () => {
      g.moveTo(-R * 0.8, -R * 0.55)
      g.bezierCurveTo(-R - 7, -R * 0.7, -R - 8 + sway, 2, -R - 5 + sway, STRAND_END - 4)
    })
  }
}

/** Draw `hair` on the head `rig.fig` just drew at (x, 0), in the character's ink. `t` swings the ponytail. */
export function drawHair(g: SKRSContext2D, rig: Rig, pose: Pose, x: number, facing: 1 | -1, hair: Hair, ink: string, t: number): void {
  if (hair === 'none') return
  const { hc, angle } = headCentre(pose)
  g.save()
  g.translate(x, 0)
  g.scale(rig.FS * facing, rig.FS)
  g.translate(hc[0], hc[1])
  g.rotate(angle)
  drawLocal(g, hair, ink, t)
  g.restore()
}
