import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { loadRig } from '@stick/engine'
import type { Catalog } from '@stick/library'
import { drawFrame } from './director.js'
import { FRAME } from './layout.js'
import { sceneAt } from './state.js'

// Ported from upstream stick-scene scripts/motion.mjs; thresholds and formulas are kept identical.
export type MotionKind = 'jump' | 'arm-through-face' | 'head-covered' | 'bent-back-elbow' | 'elbow-out-back' | 'squash' | 'skate'
export interface MotionFinding { kind: MotionKind; from: number; to: number; note: string }

type Pt = [number, number]
interface Rec {
  x: number; y: number; s: number; sx: number; alpha: number; ink: string; bot: boolean
  sh: Pt; handF: Pt; handB: Pt; eF: Pt; eB: Pt; hc: Pt; fF: Pt; fB: Pt; kF: Pt; kB: Pt
  m: [number, number, number, number, number, number]
  covered?: boolean
}
interface Frame { T: number; scene: number; figs: Rec[] }

/** Frames are drawn at half size with the stage scaled to match; only head-covered reads pixels. */
const RENDER_SCALE = 0.5
const HEAD_R = 7.8
const MERGE_S = 0.12
const JOINTS = ['handF', 'handB', 'eF', 'eB', 'hc', 'kF', 'kB', 'fF', 'fB'] as const

const W = (f: Rec, q: Pt): Pt => [f.x + q[0] * f.s * f.sx, f.y + q[1] * f.s]
const segDist = (pt: Pt, a: Pt, c: Pt): number => {
  const vx = c[0] - a[0], vy = c[1] - a[1]
  const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)))
  return Math.hypot(pt[0] - (a[0] + t * vx), pt[1] - (a[1] + t * vy))
}
const hex = (c: string): number[] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '')
  return m ? [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16)) : null
}

// upstream motion.mjs:98-121: the head is a solid ink disc; if 3 of 5 samples aren't ink, something covers the face.
function covered(g: SKRSContext2D, f: Rec, w: number, h: number): boolean {
  const ink = hex(f.ink)
  if (!ink || f.bot || f.alpha < 1) return false
  const [ma, mb, mc, md, me, mf] = f.m
  const cx = f.x + f.hc[0] * f.s * f.sx, cy = f.y + f.hc[1] * f.s, r = HEAD_R * f.s * 0.55
  let off = 0
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    const wx = cx + dx, wy = cy + dy
    const px = Math.round(ma * wx + mc * wy + me), py = Math.round(mb * wx + md * wy + mf)
    if (px < 0 || py < 0 || px >= w || py >= h) continue
    const d = g.getImageData(px, py, 1, 1).data
    if (Math.abs(d[0]! - ink[0]!) + Math.abs(d[1]! - ink[1]!) + Math.abs(d[2]! - ink[2]!) > 90) off++
  }
  return off >= 3
}

function recordFrames(tl: Timeline, catalog: Catalog, fps: number): Frame[] {
  const rig = loadRig({ instrument: true })
  const w = FRAME.w * RENDER_SCALE, h = FRAME.h * RENDER_SCALE
  const g = createCanvas(w, h).getContext('2d')
  const frames: Frame[] = []
  const n = Math.round(tl.duration * fps)
  for (let i = 0; i <= n; i++) {
    const T = Math.min(i / fps, tl.duration)
    rig.__shim.__rec = []
    g.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0)
    drawFrame(g, tl, T, rig, catalog)
    const figs = (rig.__shim.__rec as Rec[]).map((f) => ({ ...f, covered: covered(g, f, w, h) }))
    frames.push({ T, scene: tl.scenes.indexOf(sceneAt(tl, T)), figs })
  }
  rig.__shim.__rec = null
  return frames
}

type Add = (kind: MotionKind, T: number, note: string) => void

function finder(): { found: MotionFinding[]; add: Add } {
  const found: MotionFinding[] = []
  const add: Add = (kind, T, note) => {
    const at = found.reduce((acc, x, j) => (x.kind === kind && x.note.split(' ')[0] === note.split(' ')[0] ? j : acc), -1) // findLast is es2023
    const last = found[at]
    if (last && T - last.to < MERGE_S) {
      found[at] = { ...last, to: T }
      return
    }
    found.push({ kind, from: T, to: T, note })
  }
  return { found, add }
}

// upstream motion.mjs:157-178: per-frame shape checks, in local pose space as upstream does.
function shapeChecks(f: Rec, k: number, T: number, add: Add): void {
  if (Math.abs(f.sx) > 0.05 && Math.abs(f.sx) < 0.95) add('squash', T, `fig${k} sx ${f.sx.toFixed(2)}`)
  if (segDist(f.hc, f.eF, f.handF) < HEAD_R - 1.5 || segDist(f.hc, f.sh, f.eF) < HEAD_R - 2.5) add('arm-through-face', T, `fig${k}`)
  for (const [e, hd, name] of [[f.eF, f.handF, 'front'], [f.eB, f.handB, 'back']] as const) {
    const u = [e[0] - f.sh[0], e[1] - f.sh[1]] as Pt, v = [hd[0] - e[0], hd[1] - e[1]] as Pt
    const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1])
    if (lu > 1 && lv > 1 && (u[0] * v[1] - u[1] * v[0]) / (lu * lv) > 0.3) add('bent-back-elbow', T, `fig${k} ${name} arm`)
    if (lu > 1 && lv > 1 && u[0] / lu < -0.55 && v[0] / lv > 0.25 && v[1] > 0) add('elbow-out-back', T, `fig${k} ${name} arm`)
  }
  if (f.covered) add('head-covered', T, `fig${k}`)
}

// upstream motion.mjs:186-210: jump (2nd difference > 6 world units) and skate (> 1.2/frame with feet planted).
function motionChecks(fa: Rec, f: Rec, fc: Rec, k: number, T: number, add: Add): void {
  if (Math.sign(fa.sx) !== Math.sign(f.sx) || Math.sign(fc.sx) !== Math.sign(f.sx) || f.alpha < 1) return
  for (const j of JOINTS) {
    const pa = W(fa, fa[j]), pb = W(f, f[j]), pc = W(fc, fc[j])
    const acc = Math.hypot(pc[0] - 2 * pb[0] + pa[0], pc[1] - 2 * pb[1] + pa[1])
    if (acc > 6) add('jump', T, `fig${k} ${j} ${acc.toFixed(1)}`)
  }
  const planted = [f.fF, f.fB, fa.fF, fa.fB].every((q) => q[1] > -4)
  const dF = W(f, f.fF)[0] - W(fa, fa.fF)[0], dB = W(f, f.fB)[0] - W(fa, fa.fB)[0]
  if (planted && Math.abs(dF) > 1.2 && Math.abs(dB) > 1.2 && Math.sign(dF) === Math.sign(dB)) add('skate', T, `fig${k} ${dF.toFixed(1)}/frame`)
}

/** Step the film at `fps`, record every figure, and report motion glitches. */
export function checkMotion(tl: Timeline, catalog: Catalog, opts: { fps?: number } = {}): MotionFinding[] {
  const F = recordFrames(tl, catalog, opts.fps ?? 60)
  const { found, add } = finder()
  F.forEach((fr, i) => {
    fr.figs.forEach((f, k) => shapeChecks(f, k, fr.T, add))
    const a = F[i - 1], c = F[i + 1]
    if (!a || !c || a.figs.length !== fr.figs.length || c.figs.length !== fr.figs.length) return
    if (a.scene !== fr.scene || c.scene !== fr.scene) return // figures are matched by index only within a scene
    fr.figs.forEach((f, k) => motionChecks(a.figs[k]!, f, c.figs[k]!, k, fr.T, add))
  })
  return found
}
