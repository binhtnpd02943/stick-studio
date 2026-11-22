import { ACCENT, INK } from './Furniture'
import type { WalkerPose } from './floor-state'
import { hairAt } from './Person'
import { memberOf } from './team'

const SETTLE_MS = 300

/** The teammate on the move; CSS transitions carry them from point to point. */
export function Walker({ pose, ms }: { pose: WalkerPose; ms: number }) {
  const m = memberOf(pose.who)
  const duration = `${pose.moving ? ms : SETTLE_MS}ms`
  return (
    <div
      className="studio-walker" data-member={pose.who}
      style={{ left: pose.at.x - 25, top: pose.at.y, transition: `left ${duration} linear, top ${duration} linear` }}
    >
      <svg width="50" height="96" viewBox="0 0 50 96" style={{ transform: pose.dir < 0 ? 'scaleX(-1)' : undefined }}>
        <g className={pose.moving ? 'hop' : 'bob'} fill="none" stroke={m.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="25" cy="14" r="8" />
          <path d={hairAt(m.hair, 25, 14)} />
          <path d="M25 22 L25 58 M25 32 L38 40" />
          {pose.wave ? <g className="wave"><path d="M25 32 L14 18" /></g> : <path d="M25 32 L14 44" />}
          {pose.moving
            ? <><path className="legA" d="M25 58 L15 88 M25 58 L35 88" /><path className="legB" d="M25 58 L22 88 M25 58 L28 88" /></>
            : <path d="M25 58 L18 88 M25 58 L32 88" />}
        </g>
        {pose.carry && <rect className="studio-file" x="30" y="32" width="18" height="13" rx="2" fill={ACCENT} stroke={INK} strokeWidth="2" />}
      </svg>
    </div>
  )
}
