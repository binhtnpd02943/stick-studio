import type { Screenplay } from '@stick/core'
import type { Catalog } from '@stick/library'

export type IssueCode =
  | 'unknown_action'
  | 'unknown_prop'
  | 'unknown_backdrop'
  | 'unknown_cast'
  | 'unknown_target'
  | 'missing_target'
  | 'not_on_stage'
  | 'mark_collision'

export interface Issue {
  code: IssueCode
  path: string
  message: string
  /** Missing library key for unknown_action / unknown_prop / unknown_backdrop. */
  key?: string
}

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
  if (BARE_MARKS.has(t) || c.propIds.has(t) || c.cast.has(t)) return
  if (t.startsWith(NEAR)) return checkMark(c, t, path)
  c.add('unknown_target', path, `target "${t}" is not a mark, prop or cast id`)
}

/** Each character is reported as off-stage once per scene, at its first appearance. */
function checkWho(c: Ctx, who: string, path: string) {
  if (!c.cast.has(who)) {
    c.add('unknown_cast', path, `"${who}" is not in cast`)
  } else if (!(who in c.scene.start) && !c.offStage.has(who)) {
    c.offStage.add(who)
    c.add('not_on_stage', path, `"${who}" has no start mark in scene "${c.scene.id}"`)
  }
}

function validateProps(c: Ctx) {
  c.scene.props.forEach((p, pi) => {
    if (!(p.type in c.catalog.props)) {
      c.add('unknown_prop', `${c.path}.props.${pi}.type`, `unknown prop type "${p.type}"`, p.type)
    }
    checkMark(c, p.mark, `${c.path}.props.${pi}.mark`)
  })
}

function validateStart(c: Ctx) {
  const seenMarks = new Map<string, string>()
  for (const [who, mark] of Object.entries(c.scene.start)) {
    const path = `${c.path}.start.${who}`
    if (!c.cast.has(who)) c.add('unknown_cast', path, `"${who}" is not in cast`)
    checkMark(c, mark, path)
    const owner = seenMarks.get(mark)
    if (owner !== undefined) {
      c.add('mark_collision', path, `"${who}" and "${owner}" both start at "${mark}"`)
    } else {
      seenMarks.set(mark, who)
    }
  }
}

function validateAction(c: Ctx, d: NonNullable<Beat['do']>[number], dp: string) {
  checkWho(c, d.who, `${dp}.who`)
  const def = c.catalog.actions[d.action]
  if (!def) {
    c.add('unknown_action', `${dp}.action`, `unknown action "${d.action}"`, d.action)
    return
  }
  if (d.target === undefined) {
    if (def.needsTarget) c.add('missing_target', `${dp}.target`, `action "${d.action}" needs a target`)
    return
  }
  checkTarget(c, d.target, `${dp}.target`)
}

function validateBeat(c: Ctx, beat: Beat, bp: string) {
  beat.do?.forEach((d, di) => validateAction(c, d, `${bp}.do.${di}`))
  if (beat.camera) checkTarget(c, beat.camera.focus, `${bp}.camera.focus`)
  // Actions are checked before the line so not_on_stage lands on the action when both apply.
  if (beat.say) checkWho(c, beat.say.who, `${bp}.say.who`)
}

function validateScene(c: Ctx) {
  if (!(c.scene.backdrop in c.catalog.backdrops)) {
    c.add('unknown_backdrop', `${c.path}.backdrop`, `unknown backdrop "${c.scene.backdrop}"`, c.scene.backdrop)
  }
  validateProps(c)
  validateStart(c)
  c.scene.beats.forEach((beat, bi) => validateBeat(c, beat, `${c.path}.beats.${bi}`))
}

export function validateScreenplay(sp: Screenplay, catalog: Catalog): Issue[] {
  const issues: Issue[] = []
  const add: Ctx['add'] = (code, path, message, key) =>
    issues.push(key === undefined ? { code, path, message } : { code, path, message, key })
  const cast = new Set(sp.cast.map((m) => m.id))

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
