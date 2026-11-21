import { MARK_RE, type Mark } from '@stick/core'
import { defaultCatalog, lookup } from './catalog'
import type { Catalog } from './types'

export const MARK_X = { left: -95, center: 0, right: 95 }
/** World units between a prop's edge and a character standing near it. */
export const NEAR_GAP = 18
/** World units between two characters when one walks up to the other. */
export const CAST_GAP = 40

/** The slice of a scene that stage geometry reads: satisfied by both Screenplay and Timeline scenes. */
export type StageScene = { id: string; props: ReadonlyArray<{ id: string; type: string; mark: string }> }

/** Stand `gap` from x, on the side `fromX` approaches from (left when unknown). */
export const besideX = (x: number, gap: number, fromX?: number): number =>
  fromX === undefined || fromX <= x ? x - gap : x + gap

function sceneProp(id: string, scene: StageScene): StageScene['props'][number] {
  const prop = scene.props.find((p) => p.id === id)
  if (!prop) throw new Error(`layout: unknown prop "${id}" in scene ${scene.id}`)
  return prop
}

/** Props stand on bare marks only (validated), so placement never recurses. */
export function propX(id: string, scene: StageScene): number {
  const { mark } = sceneProp(id, scene)
  if (!Object.hasOwn(MARK_X, mark)) throw new Error(`layout: prop "${id}" must use a bare mark, got "${mark}"`)
  return MARK_X[mark as keyof typeof MARK_X]
}

/** Where a character stands near a prop: clear of its width plus NEAR_GAP. */
export function nearPropX(id: string, scene: StageScene, fromX: number | undefined, catalog: Catalog = defaultCatalog): number {
  const def = lookup(catalog.props, sceneProp(id, scene).type)
  if (!def) throw new Error(`layout: unknown prop type for "${id}"`)
  return besideX(propX(id, scene), def.width / 2 + NEAR_GAP, fromX)
}

export function markX(mark: Mark, scene: StageScene, fromX?: number, catalog: Catalog = defaultCatalog): number {
  if (mark.startsWith('near:')) return nearPropX(mark.slice(5), scene, fromX, catalog)
  return MARK_X[mark as keyof typeof MARK_X]
}

/** World x for an action/camera target: a Mark, a prop id or a cast id. `walk` stands beside props and people. */
export function resolveTarget(target: string, scene: StageScene, xs: ReadonlyMap<string, { x: number }>, fromX: number | undefined, walk: boolean, catalog: Catalog): number {
  if (MARK_RE.test(target)) return markX(target as Mark, scene, fromX, catalog)
  const other = xs.get(target)
  if (other) return walk ? besideX(other.x, CAST_GAP, fromX) : other.x
  return walk ? nearPropX(target, scene, fromX, catalog) : propX(target, scene)
}

/** World units a contact action can reach, measured from the target's surface (a walk_to leaves the actor NEAR_GAP away). */
export const REACH = 37

type StageAction = { who: string; action: string; target?: string | undefined }
/** The slice of a scene that action stepping reads: satisfied by a Screenplay scene. */
export type PlayScene = StageScene & { start: Readonly<Record<string, Mark>>; beats: ReadonlyArray<{ do?: ReadonlyArray<StageAction> | undefined }> }

/** Where one action leaves its actor, and how far from the target's surface it began (contact actions only). */
export interface ActionStep { from: number; to: number; gap?: number }

export const startXs = (scene: PlayScene, catalog: Catalog): Map<string, { x: number }> =>
  new Map(Object.entries(scene.start).map(([id, mark]) => [id, { x: markX(mark, scene, undefined, catalog) }]))

/** Half the width of what a contact action touches: a prop's body, or a person's (CAST_GAP less the NEAR_GAP a walk leaves). */
function surfaceHalf(target: string, scene: StageScene, xs: ReadonlyMap<string, unknown>, catalog: Catalog): number {
  if (MARK_RE.test(target)) return 0
  if (xs.has(target)) return CAST_GAP - NEAR_GAP
  return (lookup(catalog.props, sceneProp(target, scene).type)?.width ?? 0) / 2
}

/**
 * Apply one action to `xs` in place: locomotion (a catalog action with `speed`) moves its actor to the target, and the
 * solver and the validator both step through here so they cannot disagree. Throws on unresolvable targets (validate first).
 */
export function stepAction(a: StageAction, scene: StageScene, xs: Map<string, { x: number }>, catalog: Catalog): ActionStep {
  const from = xs.get(a.who)?.x ?? 0
  const def = lookup(catalog.actions, a.action)
  if (!def || a.target === undefined) return { from, to: from }
  if (def.speed !== undefined) {
    const to = resolveTarget(a.target, scene, xs, from, true, catalog)
    xs.set(a.who, { x: to })
    return { from, to }
  }
  if (!def.contact) return { from, to: from }
  const at = resolveTarget(a.target, scene, xs, from, false, catalog)
  return { from, to: from, gap: Math.max(0, Math.abs(from - at) - surfaceHalf(a.target, scene, xs, catalog)) }
}
