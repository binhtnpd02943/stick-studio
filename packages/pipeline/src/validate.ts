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

export function validateScreenplay(sp: Screenplay, catalog: Catalog): Issue[] {
  const issues: Issue[] = []
  const add = (code: IssueCode, path: string, message: string, key?: string) =>
    issues.push(key === undefined ? { code, path, message } : { code, path, message, key })
  const cast = new Set(sp.cast.map((c) => c.id))

  sp.scenes.forEach((scene, si) => {
    const sp0 = `scenes.${si}`
    const propIds = new Set(scene.props.map((p) => p.id))

    if (!(scene.backdrop in catalog.backdrops)) {
      add('unknown_backdrop', `${sp0}.backdrop`, `unknown backdrop "${scene.backdrop}"`, scene.backdrop)
    }

    // A mark is bare, or near:<prop in this scene>.
    const checkMark = (mark: string, path: string) => {
      if (mark.startsWith(NEAR) && !propIds.has(mark.slice(NEAR.length))) {
        add('unknown_target', path, `"${mark}" refers to a prop not in scene "${scene.id}"`)
      }
    }

    scene.props.forEach((p, pi) => {
      if (!(p.type in catalog.props)) {
        add('unknown_prop', `${sp0}.props.${pi}.type`, `unknown prop type "${p.type}"`, p.type)
      }
      checkMark(p.mark, `${sp0}.props.${pi}.mark`)
    })

    const seenMarks = new Map<string, string>()
    for (const [who, mark] of Object.entries(scene.start)) {
      const path = `${sp0}.start.${who}`
      if (!cast.has(who)) add('unknown_cast', path, `"${who}" is not in cast`)
      checkMark(mark, path)
      const owner = seenMarks.get(mark)
      if (owner !== undefined) {
        add('mark_collision', path, `"${who}" and "${owner}" both start at "${mark}"`)
      } else {
        seenMarks.set(mark, who)
      }
    }

    // Each character is reported as off-stage once per scene, at its first appearance.
    const offStageReported = new Set<string>()
    const checkWho = (who: string, path: string) => {
      if (!cast.has(who)) {
        add('unknown_cast', path, `"${who}" is not in cast`)
      } else if (!(who in scene.start) && !offStageReported.has(who)) {
        offStageReported.add(who)
        add('not_on_stage', path, `"${who}" has no start mark in scene "${scene.id}"`)
      }
    }

    scene.beats.forEach((beat, bi) => {
      const bp = `${sp0}.beats.${bi}`
      beat.do?.forEach((d, di) => {
        const dp = `${bp}.do.${di}`
        checkWho(d.who, `${dp}.who`)

        const def = catalog.actions[d.action]
        if (!def) {
          add('unknown_action', `${dp}.action`, `unknown action "${d.action}"`, d.action)
          return
        }
        if (d.target === undefined) {
          if (def.needsTarget) add('missing_target', `${dp}.target`, `action "${d.action}" needs a target`)
          return
        }
        const t = d.target
        if (BARE_MARKS.has(t) || propIds.has(t) || cast.has(t)) return
        if (t.startsWith(NEAR)) return checkMark(t, `${dp}.target`)
        add('unknown_target', `${dp}.target`, `target "${t}" is not a mark, prop or cast id`)
      })
      // Actions are checked before the line so not_on_stage lands on the action when both apply.
      if (beat.say) checkWho(beat.say.who, `${bp}.say.who`)
    })
  })

  return issues
}
