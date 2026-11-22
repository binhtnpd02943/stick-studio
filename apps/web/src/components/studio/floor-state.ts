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
  if (!last) return prev.working === 'intake' && next.working === 'story' ? [{ from: 'intake', to: 'story' }] : []
  return [{ from: last, to: FILM_STEPS[FILM_STEPS.indexOf(last) + 1] ?? 'review' }]
}

// Choreography: the mockup's buildFrames, one act at a time.
export type Say = { who: MemberKey | 'walker'; text: string }
export type WalkerPose = { who: MemberKey; at: Point; dir: 1 | -1; carry: boolean; moving: boolean; wave: boolean }
/** `hold`: the file has not arrived yet, so the receiver is not shown working (nor the final card). */
export type Frame = { ms: number; walker: WalkerPose | null; say: readonly Say[]; cheer: boolean; hold: boolean }
export type Act = Handoff | 'cheer'

export const BEAT_MS = 1100
const beat = (o: Partial<Frame>): Frame => ({ ms: BEAT_MS, walker: null, say: [], cheer: false, hold: false, ...o })
const held = (frames: Frame[]) => frames.map((f) => ({ ...f, hold: true }))

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

function cheerFrames(walker: WalkerPose | null): Frame[] {
  const [ship, yeah, team] = vi.studio.cheer
  return [
    beat({ walker, cheer: true, say: [{ who: 'render', text: ship }, { who: 'story', text: yeah }] }),
    beat({ walker, cheer: true, say: [{ who: 'voice', text: team }] }),
  ]
}

/** The mockup's sequence: stand, walk the file over, hand it in, walk back. The review handoff ends in the cheer. */
export function actFrames(act: Act): Frame[] {
  if (act === 'cheer') return cheerFrames(null)
  const { from: a, to: b } = act
  const d0 = route(a, b)[0]!.x < spot(a).x ? -1 : 1
  const fd = faceAt(b)
  const stand = (dir: 1 | -1, carry: boolean, wave = false) => ({ who: a, at: spot(b), dir, carry, moving: false, wave })
  const first = a === 'intake' ? vi.studio.newOrderSay : vi.studio.done
  const start = beat({ walker: { who: a, at: spot(a), dir: d0, carry: true, moving: false, wave: false }, say: [{ who: 'walker', text: first }] })
  const there = held([start, ...walk(a, a, b, true, d0)])
  if (b === 'review') {
    return [
      ...there,
      beat({ walker: stand(fd, true), say: [{ who: 'walker', text: vi.studio.sendReview }] }),
      ...cheerFrames(stand(fd, false, true)),
      ...walk(a, b, a, false, 1),
    ]
  }
  return [
    ...there,
    ...held([
      beat({ walker: stand(fd, true), say: [{ who: 'walker', text: vi.studio.send(memberOf(b).name) }] }),
      beat({ walker: stand(fd, false, true), say: [{ who: b, text: vi.studio.accept }] }),
    ]),
    ...walk(a, b, a, false, fd === 1 ? -1 : 1),
  ]
}
