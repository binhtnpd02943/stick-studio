import type { Mark, TimedAction, TimedBeat, TimedScene, Timeline } from '@stick/core'
import type { Pose, Rig } from '@stick/engine'
import type { ActionResult, Catalog, CharacterState } from '@stick/library'
import { besideX, CAST_GAP, markX, nearPropX, propX } from './layout.js'

export type CharFrame = CharacterState & { pose: Pose; gait?: ActionResult['gait'] }
export interface SceneState { scene: TimedScene; chars: CharFrame[]; zoom: number; focusX: number }

const MARK_RE = /^(left|center|right|near:.+)$/
const ZOOM_EASE = 0.5

export const restPose = (rig: Rig, t: number): Pose => rig.breathe(rig.P({ hF: [12, -60], hB: [-4, -52] }), t)

export function sceneAt(tl: Timeline, t: number): TimedScene {
  const scene = tl.scenes.filter((s) => s.start <= t).at(-1) ?? tl.scenes[0]
  if (!scene) throw new Error('director: timeline has no scenes')
  return scene
}

/** World x for an action/camera target: a Mark, a prop id or a cast id. `walk` stands beside props and people. */
export function resolveTarget(target: string, scene: TimedScene, xs: ReadonlyMap<string, CharacterState>, fromX: number | undefined, walk: boolean, catalog: Catalog): number {
  if (MARK_RE.test(target)) return markX(target as Mark, scene, fromX, catalog)
  const other = xs.get(target)
  if (other) return walk ? besideX(other.x, CAST_GAP, fromX) : other.x
  return walk ? nearPropX(target, scene, fromX, catalog) : propX(target, scene, catalog)
}

function startStates(scene: TimedScene, catalog: Catalog): Map<string, CharacterState> {
  return new Map(
    Object.entries(scene.start_marks).map(([id, mark]) => {
      const x = markX(mark, scene, undefined, catalog)
      return [id, { id, x, facing: x <= 0 ? 1 : -1 }]
    }),
  )
}

interface Live { pose: Pose; gait?: ActionResult['gait'] }

function runTrack(tr: TimedAction, t: number, scene: TimedScene, states: Map<string, CharacterState>, rig: Rig, catalog: Catalog): Live | undefined {
  const self = states.get(tr.who)
  const def = catalog.actions[tr.action]
  if (!self || !def) throw new Error(`director: unknown ${self ? 'action' : 'character'} in ${tr.who}:${tr.action}`)
  const targetX = tr.target === undefined ? undefined : resolveTarget(tr.target, scene, states, self.x, tr.action === 'walk_to', catalog)
  const dur = Math.max(tr.end - tr.start, 1e-6)
  const T = Math.min(t - tr.start, dur) // a finished action is evaluated at k=1 so its x/facing persist
  const r = def.apply({ rig, self, targetX, k: T / dur, T, dur, t, base: restPose(rig, t) })
  states.set(tr.who, { ...self, x: r.x ?? self.x, facing: r.facing ?? self.facing })
  return t < tr.end ? { pose: r.pose, gait: r.gait } : undefined
}

function talkPose(scene: TimedScene, self: CharacterState, t: number, rig: Rig, catalog: Catalog): Pose | undefined {
  const line = scene.beats.find((b) => b.line?.who === self.id && b.line.start <= t && t < b.line.end)?.line
  const talk = catalog.actions.talk
  if (!line || !talk) return undefined
  const dur = line.end - line.start
  const T = t - line.start
  return talk.apply({ rig, self, k: T / dur, T, dur, t, base: restPose(rig, t) }).pose
}

function zoomAt(beats: TimedBeat[], i: number, t: number, rig: Rig): number {
  const beat = beats[i]
  if (!beat) return 1
  const from = i === 0 ? 1 : zoomAt(beats, i - 1, beat.start, rig)
  const to = beat.camera?.zoom ?? 1
  const k = rig.E.soft(rig.seg(t - beat.start, 0, ZOOM_EASE))
  return k >= 1 ? to : from + (to - from) * k
}

export function sceneStateAt(tl: Timeline, t: number, rig: Rig, catalog: Catalog): SceneState {
  const scene = sceneAt(tl, t)
  const states = startStates(scene, catalog)
  const live = new Map<string, Live>()
  const started = scene.beats.filter((b) => b.start <= t)
  for (const tr of started.flatMap((b) => [...b.tracks].sort((a, c) => a.start - c.start))) {
    if (tr.start > t) continue
    const l = runTrack(tr, t, scene, states, rig, catalog)
    if (l) live.set(tr.who, l)
  }
  const chars = [...states.values()].map((s) => {
    const l = live.get(s.id)
    return { ...s, pose: l?.pose ?? talkPose(scene, s, t, rig, catalog) ?? restPose(rig, t), gait: l?.gait }
  })
  const zoom = zoomAt(scene.beats, started.length - 1, t, rig)
  const cam = started.filter((b) => b.camera).at(-1)?.camera
  const focusX = cam ? resolveTarget(cam.focus, scene, states, undefined, false, catalog) : 0
  return { scene, chars, zoom, focusX }
}
