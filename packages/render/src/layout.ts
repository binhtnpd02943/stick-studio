import type { Mark, TimedScene } from '@stick/core'

export const FRAME = { w: 1080, h: 1920 }
export const STAGE = { worldWidth: 300, scale: 3.6, groundY: 1250 }
export const TITLE = { y: 300, size: 64 }
export const CAPTION = { cx: 500, y: 1450, maxWidth: 780, size: 60, minSize: 44, maxLines: 2 }
export const MARK_X = { left: -95, center: 0, right: 95 }
export const NEAR_OFFSET = 45

/** Stand beside a prop, on the side `fromX` approaches from (left when unknown). */
export const besideX = (x: number, fromX?: number): number =>
  fromX === undefined || fromX <= x ? x - NEAR_OFFSET : x + NEAR_OFFSET

export function propX(id: string, scene: TimedScene): number {
  const prop = scene.props.find((p) => p.id === id)
  if (!prop) throw new Error(`layout: unknown prop "${id}" in scene ${scene.id}`)
  return markX(prop.mark, scene)
}

export function markX(mark: Mark, scene: TimedScene, fromX?: number): number {
  if (mark.startsWith('near:')) return besideX(propX(mark.slice(5), scene), fromX)
  return MARK_X[mark as keyof typeof MARK_X]
}
