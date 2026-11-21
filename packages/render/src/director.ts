import type { SKRSContext2D } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { registerFonts, type Rig } from '@stick/engine'
import { lookup, type Catalog } from '@stick/library'
import { drawCaption } from './captions.js'
import { FRAME, STAGE, TITLE, propX } from './layout.js'
import { drawHair } from './look.js'
import { sceneStateAt, type SceneState } from './state.js'

const GROUND_LINE = 3
const FAR_TINT = 0.55
const FIG_HALF = 18 // world units from a figure's x to its outer edge, arms at rest

function need<T>(def: T | undefined, what: string): T {
  if (!def) throw new Error(`director: unknown ${what}`)
  return def
}

/** Mix a #rrggbb colour toward white by `k`. */
export function tint(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift: number) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * k)
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

function drawGround(g: SKRSContext2D, rig: Rig): void {
  g.fillStyle = rig.C.paper
  g.fillRect(0, 0, FRAME.w, FRAME.h)
  g.fillStyle = rig.C.floor
  g.fillRect(0, STAGE.groundY, FRAME.w, FRAME.h - STAGE.groundY)
  g.fillStyle = rig.C.ink
  g.fillRect(0, STAGE.groundY - GROUND_LINE / 2, FRAME.w, GROUND_LINE)
}

/** Zoom about the focus point, but slide back as needed so no figure leaves the frame. */
export function cameraShift(zoom: number, focusX: number, xs: number[]): number {
  const want = focusX * (1 - 1 / zoom)
  if (xs.length === 0) return want
  const half = STAGE.worldWidth / 2 / zoom - FIG_HALF
  const lo = Math.max(...xs) - half
  const hi = Math.min(...xs) + half
  return lo > hi ? (lo + hi) / 2 : Math.min(Math.max(want, lo), hi) // midpoint keeps it continuous at lo == hi
}

function applyCamera(g: SKRSContext2D, st: SceneState): void {
  g.translate(FRAME.w / 2, STAGE.groundY)
  g.scale(STAGE.scale * st.zoom, STAGE.scale * st.zoom)
  g.translate(-cameraShift(st.zoom, st.focusX, st.chars.map((c) => c.x)), 0)
}

function drawStage(g: SKRSContext2D, tl: Timeline, t: number, rig: Rig, catalog: Catalog, st: SceneState): void {
  const { scene } = st
  const dom = g as unknown as CanvasRenderingContext2D // library defs are typed against the DOM context
  need(lookup(catalog.backdrops, scene.backdrop), `backdrop ${scene.backdrop}`).draw(dom, rig, t)
  for (const p of scene.props) need(lookup(catalog.props, p.type), `prop type ${p.type}`).draw(dom, rig, propX(p.id, scene), t)
  rig.setSettle(1)
  for (const c of st.chars) {
    const look = tl.cast.find((m) => m.id === c.id)?.look
    const ink = look?.ink ?? rig.C.ink
    const gait = c.gait
    const pose = rig.legs(c.pose, gait?.ph ?? 0, gait?.amp ?? 0, { arms: false, ...(gait?.stride ? { stride: gait.stride } : {}) })
    const colour = ink.toLowerCase() === rig.C.ink ? {} : { ink, far: tint(ink, FAR_TINT) }
    const J = rig.fig(g, pose, c.x, 0, { sx: c.facing, ...colour })
    drawHair(g, rig, pose, c.x, c.facing, look?.hair ?? 'none', ink, t)
    // J.w holds the hands and head exactly as fig drew them (it may reach or clear the pose targets).
    c.overlay?.(dom, rig, { x: c.x, facing: c.facing, pose, t, head: J.w.head, ink, hands: { near: J.w.handF, far: J.w.handB } })
  }
}

export function drawFrame(g: SKRSContext2D, tl: Timeline, t: number, rig: Rig, catalog: Catalog): void {
  registerFonts()
  const st = sceneStateAt(tl, t, rig, catalog)
  g.save()
  drawGround(g, rig)
  g.save()
  applyCamera(g, st)
  drawStage(g, tl, t, rig, catalog, st)
  g.restore()
  if (tl.title && st.scene === tl.scenes[0]) rig.text(g, tl.title, FRAME.w / 2, TITLE.y, TITLE.size, rig.C.ink)
  const line = st.scene.beats.find((b) => b.line && b.line.start <= t && t < b.line.end)?.line
  if (line) drawCaption(g, line.text, t, line.start, line.end)
  g.restore()
}
