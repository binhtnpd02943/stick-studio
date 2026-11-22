import { FILM_STEPS, type FilmStep } from '@stick/core'
import type { FilmDetail } from '../../api/schemas'
import { vi } from '../../i18n/vi'
import { type Point, type SpotKey, headOf, route, spot, walkMs } from './layout'
import { type MemberKey, memberOf } from './team'

export type FloorState = {
  working: MemberKey | null
  done: ReadonlySet<FilmStep>
  failed: FilmStep | null
  final: boolean
  note: string | null
}
export type Handoff = { from: MemberKey; to: MemberKey | 'review' }

const FINAL: readonly FilmDetail['film']['status'][] = ['awaiting_review', 'approved', 'publishing', 'published']

export function deriveFloor({ film, steps }: FilmDetail): FloorState {
  const inFlight = film.status === 'queued' || film.status === 'running'
  const running = steps.find((s) => s.status === 'running')?.step ?? null
  return {
    working: !inFlight ? null : running ?? (film.status === 'queued' ? 'intake' : null),
    done: new Set(steps.filter((s) => s.status === 'succeeded' || s.status === 'skipped').map((s) => s.step)),
    failed: film.status === 'qa_failed' ? 'gate' : steps.find((s) => s.status === 'failed')?.step ?? null,
    final: FINAL.includes(film.status),
    note: film.status === 'blocked_budget' ? vi.status.blocked_budget : film.status === 'cancelled' ? vi.status.cancelled : null,
  }
}

/** One handoff for the last step that became done; a reconnect snapshot after a gap never replays a backlog. */
export function handoffsBetween(prev: FloorState, next: FloorState): Handoff[] {
  const last = FILM_STEPS.filter((s) => next.done.has(s) && !prev.done.has(s)).at(-1)
  if (!last) return []
  return [{ from: last, to: FILM_STEPS[FILM_STEPS.indexOf(last) + 1] ?? 'review' }]
}

// Choreography: the mockup's buildFrames, one act at a time.
export type Say = { who: MemberKey | 'walker'; text: string }
export type WalkerPose = { who: MemberKey; at: Point; dir: 1 | -1; carry: boolean; moving: boolean; wave: boolean }
export type Frame = { ms: number; walker: WalkerPose | null; say: readonly Say[]; cheer: boolean }
export type Act = Handoff | 'cheer'

export const BEAT_MS = 1100
const beat = (o: Partial<Frame>): Frame => ({ ms: BEAT_MS, walker: null, say: [], cheer: false, ...o })

function walk(who: MemberKey, from: SpotKey, to: SpotKey, carry: boolean, dir0: 1 | -1): Frame[] {
  let prev = spot(from)
  let dir = dir0
  return route(from, to).map((at) => {
    if (at.x !== prev.x) dir = at.x < prev.x ? -1 : 1
    const frame = beat({ ms: walkMs(prev, at), walker: { who, at, dir, carry, moving: true, wave: false } })
    prev = at
    return frame
  })
}

/** Which way the sender faces when standing at `to`'s spot: towards the receiver's head. */
const faceAt = (to: SpotKey): 1 | -1 => (to === 'review' || headOf(to).x < spot(to).x ? -1 : 1)

export function actFrames(act: Act): Frame[] {
  if (act === 'cheer') {
    const [ship, yeah, team] = vi.studio.cheer
    return [
      beat({ cheer: true, say: [{ who: 'render', text: ship }, { who: 'story', text: yeah }] }),
      beat({ cheer: true, say: [{ who: 'voice', text: team }] }),
    ]
  }
  const { from: a, to: b } = act
  const d0 = route(a, b)[0]!.x < spot(a).x ? -1 : 1
  const fd = faceAt(b)
  const stand = (dir: 1 | -1, carry: boolean, wave = false) => ({ who: a, at: spot(b), dir, carry, moving: false, wave })
  const start = beat({ walker: { who: a, at: spot(a), dir: d0, carry: true, moving: false, wave: false }, say: [{ who: 'walker', text: vi.studio.done }] })
  if (b === 'review') {
    return [start, ...walk(a, a, b, true, d0), beat({ walker: stand(fd, true), say: [{ who: 'walker', text: vi.studio.sendReview }] }), ...walk(a, b, a, false, 1)]
  }
  return [
    start,
    ...walk(a, a, b, true, d0),
    beat({ walker: stand(fd, true), say: [{ who: 'walker', text: vi.studio.send(memberOf(b).name) }] }),
    beat({ walker: stand(fd, false, true), say: [{ who: b, text: vi.studio.accept }] }),
    ...walk(a, b, a, false, fd === 1 ? -1 : 1),
  ]
}
