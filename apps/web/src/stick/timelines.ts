import type { Timeline } from '@stick/core'
import { soloTimeline, type Hair } from '@stick/render/frame'

export const IDLE_LOOP_S = 8
export const GLANCE_AT_S = 5
export const GLANCE_END_S = 6.5

export function openingScene(tl: Timeline): Timeline {
  const scene = tl.scenes[0]!
  return { ...tl, duration: scene.end, scenes: [scene] }
}

/** Scene 0 at rest for IDLE_LOOP_S, everyone glancing around once; breathing comes from the rest pose. */
export function idleTimeline(tl: Timeline): Timeline {
  const scene = tl.scenes[0]!
  const tracks = Object.keys(scene.start_marks).map((who) => ({ who, action: 'look_around', params: {}, start: GLANCE_AT_S, end: GLANCE_END_S }))
  return {
    ...tl,
    duration: IDLE_LOOP_S,
    scenes: [{ ...scene, start: 0, end: IDLE_LOOP_S, beats: [{ id: `${scene.id}.b0`, start: 0, end: IDLE_LOOP_S, tracks }] }],
  }
}

export function castTimeline(look: { ink: string; hair?: Hair }): Timeline {
  const tl = soloTimeline('wave', 2, undefined, undefined, look.ink)
  return { ...tl, cast: tl.cast.map((c) => ({ ...c, look })) }
}

export const STICK_STATES: Record<'empty' | 'rendering' | 'error' | 'done', Timeline> = {
  empty: soloTimeline('shrug', 2),
  rendering: soloTimeline('type_laptop', 3, 'near:desk', 'desk'),
  error: soloTimeline('facepalm', 2),
  done: soloTimeline('cheer', 2),
}
