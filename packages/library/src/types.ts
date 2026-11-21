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
}

export interface ActionDef {
  id: string
  version: number
  needsTarget: boolean
  duration: { min: number; ideal: number; max: number }
  description: string
  apply(ctx: ActionContext): ActionResult
}

export interface PropDef {
  id: string
  version: number
  width: number
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
