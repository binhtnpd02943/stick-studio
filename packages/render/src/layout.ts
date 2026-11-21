import type { Mark, TimedScene } from '@stick/core'
import { defaultCatalog, type Catalog } from '@stick/library'

export const FRAME = { w: 1080, h: 1920 }
export const STAGE = { worldWidth: 300, scale: 3.6, groundY: 1250 }
export const TITLE = { y: 300, size: 64 }
export const CAPTION = { cx: 500, y: 1450, maxWidth: 780, size: 60, minSize: 44, maxLines: 2 }
export const MARK_X = { left: -95, center: 0, right: 95 }
/** World units between a prop's edge and a character standing near it. */
export const NEAR_GAP = 18
/** World units between two characters when one walks up to the other. */
export const CAST_GAP = 40

/** Stand `gap` from x, on the side `fromX` approaches from (left when unknown). */
export const besideX = (x: number, gap: number, fromX?: number): number =>
  fromX === undefined || fromX <= x ? x - gap : x + gap

function sceneProp(id: string, scene: TimedScene): TimedScene['props'][number] {
  const prop = scene.props.find((p) => p.id === id)
  if (!prop) throw new Error(`layout: unknown prop "${id}" in scene ${scene.id}`)
  return prop
}

export function propX(id: string, scene: TimedScene, catalog: Catalog = defaultCatalog): number {
  return markX(sceneProp(id, scene).mark, scene, undefined, catalog)
}

/** Where a character stands near a prop: clear of its width plus NEAR_GAP. */
export function nearPropX(id: string, scene: TimedScene, fromX: number | undefined, catalog: Catalog = defaultCatalog): number {
  const def = catalog.props[sceneProp(id, scene).type]
  if (!def) throw new Error(`layout: unknown prop type for "${id}"`)
  return besideX(propX(id, scene, catalog), def.width / 2 + NEAR_GAP, fromX)
}

export function markX(mark: Mark, scene: TimedScene, fromX?: number, catalog: Catalog = defaultCatalog): number {
  if (mark.startsWith('near:')) return nearPropX(mark.slice(5), scene, fromX, catalog)
  return MARK_X[mark as keyof typeof MARK_X]
}
