import { INK } from './Furniture'
import { HEAD, figureAt } from './layout'
import type { Member } from './team'

const HANG = 'M40 42 L32 58 L36 70'
const REST = 'M29 58 L38 74 L50 80'
const POSE = {
  sit: { body: 'M30 49 L26 86 L52 88 L54 122 M26 86 L46 93 L48 122', work: 'M29 58 L44 70 L64 74', workOther: '', cheer: 'M29 58 L20 30 M29 58 L42 30' },
  stand: { body: 'M40 31 L40 76 L32 124 M40 76 L48 124', work: 'M40 42 L56 48 L72 42', workOther: HANG, cheer: 'M40 42 L30 14 M40 42 L52 14' },
} as const

/** Per-member arms and props from the mockup's team table. */
const ART: Record<Member['key'], { work?: string; arm: string; other?: string; prop?: string; fill?: string }> = {
  intake: { arm: REST },
  story: { arm: 'M40 42 L28 52 L38 62 M40 42 L52 52 L42 62' },
  screenplay: { arm: 'M29 58 L42 68 L37 50' },
  validate: { arm: 'M29 58 L38 70 L42 56', prop: 'M40 44 L47 44 L47 56 L40 56 Z', fill: 'var(--accent)' },
  voice: { work: 'M40 42 L52 44 L49 24', arm: 'M40 42 L48 58 L46 70', other: HANG },
  timeline: { arm: 'M40 42 L50 52 L50 38', other: HANG, prop: 'M47 28 L54 28 L54 40 L47 40 Z', fill: 'var(--accent)' },
  gate: { arm: 'M40 42 L50 56 L58 54', other: HANG, prop: 'M56 48 L63 48 L62 58 L57 58 Z', fill: 'var(--bg)' },
  render: { arm: REST },
  contact: { work: 'M40 42 L54 46 L64 44', arm: 'M40 42 L52 50 L46 30', other: HANG },
}
const IDLE_CLASS: Record<Member['idle'], string> = { rest: '', hips: 'think', chin: 'think', phone: 'scroll', stretch: 'stretch', sip: 'sip' }

export function hairAt(key: Member['hair'], x: number, y: number): string {
  const cap = `M${x - 9} ${y - 4} Q${x} ${y - 14} ${x + 9} ${y - 4}`
  if (key === 'short') return cap
  if (key === 'ponytail') return `${cap} M${x - 9} ${y - 3} Q${x - 16} ${y} ${x - 14} ${y + 10}`
  if (key === 'long') return `${cap} M${x - 9} ${y - 3} L${x - 11} ${y + 14}`
  if (key === 'phones') return `M${x - 9} ${y} Q${x - 9} ${y - 13} ${x} ${y - 13} Q${x + 9} ${y - 13} ${x + 9} ${y}`
  return ''
}

type Props = { member: Member; index: number; working: boolean; cheer: boolean; away: boolean; motion: boolean }

/** A seated or standing teammate: works when it is their step, otherwise plays their own idle loop. */
export function Person({ member: m, index, working, cheer, away, motion }: Props) {
  const pose = POSE[m.pose]
  const art = ART[m.key]
  const head = HEAD[m.pose]
  const at = figureAt(m.key)
  const delay = { animationDelay: `${-index * 1.3}s` }
  const idle = !working && !cheer
  const cls = (name: string) => (motion && name ? name : undefined)
  return (
    <div className={working ? 'studio-person is-working' : 'studio-person'} data-member={m.key} style={{ left: at.x, top: at.y }}>
      <svg width="80" height="130" viewBox="0 0 80 130" style={{ transform: m.flip ? 'scaleX(-1)' : undefined, overflow: 'visible' }}>
        {m.pose === 'sit' && <path d="M8 92 L38 92 M10 92 L8 62 M23 92 L23 126 M13 126 L33 126" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {!away && (
          <g className={cls(cheer ? 'hop' : 'bob')} style={delay} fill="none" stroke={m.ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <g className={cls(idle && m.idle === 'chin' ? 'think' : '')} style={delay}>
              <circle cx={head.x} cy={head.y} r="9" />
              <path d={hairAt(m.hair, head.x, head.y)} />
            </g>
            <path d={pose.body} />
            {working && !cheer && <><path className={cls('type')} d={art.work ?? pose.work} /><path d={pose.workOther} /></>}
            {idle && (
              <>
                <g className={cls(IDLE_CLASS[m.idle])} style={delay}>
                  <path d={art.arm} />
                  {art.prop && <path d={art.prop} fill={art.fill} stroke={INK} strokeWidth="1.5" />}
                </g>
                {art.other && <path d={art.other} />}
              </>
            )}
            {cheer && <g className={cls('wave')}><path d={pose.cheer} /></g>}
          </g>
        )}
      </svg>
      <div className="studio-tag"><span><b>{m.name}</b> <span>· {m.role}</span></span></div>
    </div>
  )
}
