import type { SfxId } from '@stick/core'
import type { Pose, Rig } from '@stick/engine'

export interface CharacterState {
  id: string
  x: number
  facing: 1 | -1
}

export interface ActionContext {
  rig: Rig
  self: CharacterState
  targetX?: number
  /** progress through the action, 0..1 */
  k: number
  /** seconds since the action started */
  T: number
  dur: number
  /** global seconds, for looping gestures */
  t: number
  /** rest pose with breathing already applied */
  base: Pose
}

export interface ActionResult {
  pose: Pose
  x?: number
  facing?: 1 | -1
  gait?: { ph: number; amp: number; stride?: number }
  /** Drawn after the figure and hair, in world coordinates; `hands` are where fig drew the hands, `head` the head centre. */
  overlay?: (g: CanvasRenderingContext2D, rig: Rig, at: OverlayAt) => void
}

export interface OverlayAt {
  x: number
  facing: 1 | -1
  pose: Pose
  /** global seconds */
  t: number
  head: [number, number]
  /** The character's ink colour, for hand-held props' fingers. */
  ink: string
  hands: { near: [number, number]; far: [number, number] }
}

/** What an action's `sfx` needs beyond its duration: the rig (for gait and ramp math) and, for locomotion, how far it travels. */
export interface SfxEnv {
  rig: Rig
  distance: number
}

export interface ActionDef {
  id: string
  version: number
  needsTarget: boolean
  /** Touches its target: the actor must stand within REACH of it (validator `out_of_reach`). */
  contact?: boolean
  /** The target prop must have a `seatY` (validator `unknown_target` otherwise). */
  needsSeat?: boolean
  /** Locomotion, world units per second: the solver sizes the action by distance / speed and the actor ends at the target. */
  speed?: number
  duration: { min: number; ideal: number; max: number }
  description: string
  /** Sound cues, `at` in seconds from the action start, taken from the same phase math as `apply` so they land on the visible contact. */
  sfx?: (dur: number, env: SfxEnv) => { id: SfxId; at: number }[]
  apply(ctx: ActionContext): ActionResult
}

export interface PropDef {
  id: string
  version: number
  width: number
  /** World y of the seat surface (ground 0, up is negative), for props a character can sit on. */
  seatY?: number
  description: string
  draw(g: CanvasRenderingContext2D, rig: Rig, x: number, t: number): void
}

export interface BackdropDef {
  id: string
  version: number
  description: string
  draw(g: CanvasRenderingContext2D, rig: Rig, t: number): void
}

export interface Catalog {
  actions: Record<string, ActionDef>
  props: Record<string, PropDef>
  backdrops: Record<string, BackdropDef>
}
