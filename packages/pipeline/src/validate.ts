import type { Issue, IssueCode, Screenplay } from '@stick/core'
import { CAST_GAP, lookup, REACH, startXs, stepAction, type ActionStep, type Catalog } from '@stick/library'

export type { Issue, IssueCode } from '@stick/core'

const BARE_MARKS = new Set(['left', 'center', 'right'])
const NEAR = 'near:'

type Scene = Screenplay['scenes'][number]
type Beat = Scene['beats'][number]

interface Ctx {
  cast: Set<string>
  propIds: Set<string>
  scene: Scene
  /** `scenes.N` */
  path: string
  catalog: Catalog
  /** Characters already reported as off-stage in this scene. */
  offStage: Set<string>
  add: (code: IssueCode, path: string, message: string, key?: string) => void
}

/** A mark is bare, or near:<prop in this scene>. */
function checkMark(c: Ctx, mark: string, path: string) {
  if (mark.startsWith(NEAR) && !c.propIds.has(mark.slice(NEAR.length))) {
    c.add('unknown_target', path, `"${mark}" refers to a prop not in scene "${c.scene.id}"`)
  }
}

/** A target is a mark, a prop id in this scene, or a cast id. */
function checkTarget(c: Ctx, t: string, path: string) {
  if (BARE_MARKS.has(t) || c.propIds.has(t)) return
  if (c.cast.has(t)) {
    if (!Object.hasOwn(c.scene.start, t)) c.add('unknown_target', path, `target "${t}" has no start mark in scene "${c.scene.id}"`)
    return
  }
  if (t.startsWith(NEAR)) return checkMark(c, t, path)
  c.add('unknown_target', path, `target "${t}" is not a mark, prop or cast id`)
}

/** Each character is reported as off-stage once per scene, at its first appearance. */
function checkWho(c: Ctx, who: string, path: string) {
  if (!c.cast.has(who)) {
    c.add('unknown_cast', path, `"${who}" is not in cast`)
  } else if (!Object.hasOwn(c.scene.start, who) && !c.offStage.has(who)) {
    c.offStage.add(who)
    c.add('not_on_stage', path, `"${who}" has no start mark in scene "${c.scene.id}"`)
  }
}

function validateProps(c: Ctx) {
  c.scene.props.forEach((p, pi) => {
    if (!lookup(c.catalog.props, p.type)) {
      c.add('unknown_prop', `${c.path}.props.${pi}.type`, `unknown prop type "${p.type}"`, p.type)
    }
    // Props stand on bare marks only, so prop placement can never chain or loop.
    if (!BARE_MARKS.has(p.mark)) c.add('unknown_target', `${c.path}.props.${pi}.mark`, `prop "${p.id}" must use left, center or right`)
  })
}

function validateStart(c: Ctx) {
  const seenMarks = new Map<string, string>()
  for (const [who, mark] of Object.entries(c.scene.start)) {
    const path = `${c.path}.start.${who}`
    if (!c.cast.has(who)) c.add('unknown_cast', path, `"${who}" is not in cast`)
    checkMark(c, mark, path)
    const owner = seenMarks.get(mark)
    const prop = c.scene.props.find((p) => p.mark === mark)
    if (prop) c.add('mark_collision', path, `"${who}" starts at "${mark}" on top of prop "${prop.id}": start at "near:${prop.id}" instead`)
    if (owner !== undefined) {
      c.add('mark_collision', path, `"${who}" and "${owner}" both start at "${mark}"`)
    } else {
      seenMarks.set(mark, who)
    }
  }
}

function validateAction(c: Ctx, d: NonNullable<Beat['do']>[number], dp: string) {
  checkWho(c, d.who, `${dp}.who`)
  const def = lookup(c.catalog.actions, d.action)
  if (!def) {
    c.add('unknown_action', `${dp}.action`, `unknown action "${d.action}"`, d.action)
    return
  }
  if (d.target === undefined) {
    if (def.needsTarget) c.add('missing_target', `${dp}.target`, `action "${d.action}" needs a target`)
    return
  }
  checkTarget(c, d.target, `${dp}.target`)
  if (def.needsSeat) checkSeat(c, d.action, d.target, `${dp}.target`)
}

function checkSeat(c: Ctx, action: string, target: string, path: string) {
  const type = c.scene.props.find((p) => p.id === target)?.type
  if (type === undefined || lookup(c.catalog.props, type)?.seatY === undefined) {
    c.add('unknown_target', path, `cannot ${action} on ${type ?? target}`)
  }
}

function validateBeat(c: Ctx, beat: Beat, bp: string) {
  beat.do?.forEach((d, di) => validateAction(c, d, `${bp}.do.${di}`))
  if (beat.camera) checkTarget(c, beat.camera.focus, `${bp}.camera.focus`)
  // Actions are checked before the line so not_on_stage lands on the action when both apply.
  if (beat.say) checkWho(c, beat.say.who, `${bp}.say.who`)
}

/** The scene minus whatever validation rejected, so that stepping through it cannot throw: bad props and start marks are dropped. */
function steppable(c: Ctx): Scene {
  const props = c.scene.props.filter((p) => lookup(c.catalog.props, p.type) && BARE_MARKS.has(p.mark))
  const ids = new Set(props.map((p) => p.id))
  const start = Object.fromEntries(
    Object.entries(c.scene.start).filter(([who, mark]) => c.cast.has(who) && (BARE_MARKS.has(mark) || (mark.startsWith(NEAR) && ids.has(mark.slice(NEAR.length))))),
  )
  return { ...c.scene, props, start }
}

/** A walk must not cross another character or stop within CAST_GAP of one (the figures overlap); its own target cast member is where it stops, at the gap. */
function checkPath(c: Ctx, d: { who: string; action: string; target?: string | undefined }, { from, to }: ActionStep, xs: ReadonlyMap<string, { x: number }>, path: string) {
  const dir = Math.sign(to - from)
  if (dir === 0) return
  const other = [...xs].find(([who, { x }]) => who !== d.who && who !== d.target && (x - from) * dir > 0 && (x - to) * dir < CAST_GAP)?.[0]
  if (other !== undefined) {
    c.add('path_blocked', path, `"${d.who}"'s ${d.action} to "${d.target}" walks through "${other}": pick a target on this side of "${other}", or move "${other}" out of the way first`)
  }
}

/**
 * Contact actions need the actor within REACH, and walks must not pass through anyone; earlier walks in the scene count.
 * Actions whose actor or target failed validation are skipped.
 */
function validateReach(c: Ctx) {
  const sp = steppable(c)
  const xs = startXs(sp, c.catalog)
  const ids = new Set(sp.props.map((p) => p.id))
  const known = (t: string) => BARE_MARKS.has(t) || ids.has(t) || xs.has(t) || (t.startsWith(NEAR) && ids.has(t.slice(NEAR.length)))
  sp.beats.forEach((beat, bi) =>
    beat.do?.forEach((d, di) => {
      if (!xs.has(d.who) || (d.target !== undefined && !known(d.target))) return
      const path = `${c.path}.beats.${bi}.do.${di}`
      const step = stepAction(d, sp, xs, c.catalog)
      if (lookup(c.catalog.actions, d.action)?.speed !== undefined) checkPath(c, d, step, xs, path)
      const { gap } = step
      if (gap !== undefined && gap > REACH) {
        c.add('out_of_reach', path, `"${d.who}" is ${Math.round(gap)} from "${d.target}" (reach ${REACH}): add a walk_to before "${d.action}"`)
      }
    }),
  )
}

function validateScene(c: Ctx) {
  if (!lookup(c.catalog.backdrops, c.scene.backdrop)) {
    c.add('unknown_backdrop', `${c.path}.backdrop`, `unknown backdrop "${c.scene.backdrop}"`, c.scene.backdrop)
  }
  validateProps(c)
  validateStart(c)
  c.scene.beats.forEach((beat, bi) => validateBeat(c, beat, `${c.path}.beats.${bi}`))
  validateReach(c)
}

/** Report each id that repeats one in `taken` (or a mark name), adding it otherwise. */
function claimIds(ids: { id: string; path: string }[], taken: Set<string>, add: Ctx['add']) {
  for (const { id, path } of ids) {
    if (taken.has(id) || BARE_MARKS.has(id)) add('duplicate_id', path, `id "${id}" is already used or is a mark name`)
    else taken.add(id)
  }
}

function validateIds(sp: Screenplay, add: Ctx['add']) {
  const castIds = new Set<string>()
  claimIds(sp.cast.map((m, i) => ({ id: m.id, path: `cast.${i}.id` })), castIds, add)
  const sceneIds = new Set<string>()
  sp.scenes.forEach((s, si) => {
    if (sceneIds.has(s.id)) add('duplicate_id', `scenes.${si}.id`, `scene id "${s.id}" is used twice`)
    sceneIds.add(s.id)
    // Prop ids share a namespace with cast ids: targets resolve either.
    claimIds(s.props.map((p, pi) => ({ id: p.id, path: `scenes.${si}.props.${pi}.id` })), new Set(castIds), add)
  })
}

export function validateScreenplay(sp: Screenplay, catalog: Catalog): Issue[] {
  const issues: Issue[] = []
  const add: Ctx['add'] = (code, path, message, key) =>
    issues.push(key === undefined ? { code, path, message } : { code, path, message, key })
  const cast = new Set(sp.cast.map((m) => m.id))
  validateIds(sp, add)

  sp.scenes.forEach((scene, si) =>
    validateScene({
      cast,
      propIds: new Set(scene.props.map((p) => p.id)),
      scene,
      path: `scenes.${si}`,
      catalog,
      offStage: new Set(),
      add,
    }),
  )
  return issues
}
