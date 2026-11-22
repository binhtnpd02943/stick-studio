import { FILM_STEPS } from '@stick/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FilmDetail } from '../../api/schemas'
import { vi } from '../../i18n/vi'
import { useReducedMotion } from '../../stick/use-reduced-motion'
import { type Act, type FloorState, type Say, actFrames, deriveFloor, handoffsBetween } from './floor-state'
import { Furniture } from './Furniture'
import { SCENE, headOf } from './layout'
import { Person } from './Person'
import { type MemberKey, TEAM, memberOf } from './team'
import { Walker } from './Walker'
import { WorkBubble } from './WorkBubble'
import './studio.css'

export const MIN_FLOOR_WIDTH = 720
const CHAT_AFTER_MS = 6000
const CHAT_EVERY_MS = 8000
const CHAT_SHOW_MS = 3000

function useWidth() {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { box, width }
}

/** Handoffs and the final cheer, played one act at a time; returns the current frame. */
function useChoreography(floor: FloorState, motion: boolean) {
  const prev = useRef(floor)
  const [queue, setQueue] = useState<readonly Act[]>([])
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const before = prev.current
    prev.current = floor
    if (!motion || before === floor) return
    const acts: Act[] = handoffsBetween(before, floor)
    if (floor.final && !before.final) acts.push('cheer')
    if (acts.length > 0) setQueue((q) => [...q, ...acts])
  }, [floor, motion])
  useEffect(() => {
    if (motion) return
    setQueue([])
    setIndex(0)
  }, [motion])

  const act = queue[0]
  const frames = useMemo(() => (act ? actFrames(act) : []), [act])
  const frame = frames[index] ?? null
  useEffect(() => {
    if (!frame) return
    const t = setTimeout(() => {
      if (index + 1 < frames.length) return setIndex(index + 1)
      setIndex(0)
      setQueue((q) => q.slice(1))
    }, frame.ms)
    return () => clearTimeout(t)
  }, [frame, frames, index])
  return frame
}

/** While a step runs past CHAT_AFTER_MS, an idle teammate says one line, at most every CHAT_EVERY_MS. */
function useChatter(working: MemberKey | null, motion: boolean) {
  const [chat, setChat] = useState<Say | null>(null)
  useEffect(() => {
    if (!motion || !working || working === 'intake') return
    const idle = TEAM.filter((m) => m.key !== working)
    let n = 0
    let hide: ReturnType<typeof setTimeout> | undefined
    let every: ReturnType<typeof setInterval> | undefined
    const speak = () => {
      const who = idle[(n + FILM_STEPS.indexOf(working) * 3) % idle.length]!.key
      setChat({ who, text: vi.studio.chat[n % vi.studio.chat.length]! })
      n += 1
      hide = setTimeout(() => setChat(null), CHAT_SHOW_MS)
    }
    const first = setTimeout(() => {
      speak()
      every = setInterval(speak, CHAT_EVERY_MS)
    }, CHAT_AFTER_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
      clearTimeout(hide)
      setChat(null)
    }
  }, [working, motion])
  return chat
}

function statusLine(floor: FloorState, failedLabel: string): string {
  if (floor.working) return `${memberOf(floor.working).name} ${vi.studio.team[floor.working].doing}`
  if (floor.failed) return `${memberOf(floor.failed).name}: ${failedLabel}`
  if (floor.note) return `${memberOf('intake').name}: ${floor.note}`
  return floor.final ? vi.studio.final : vi.studio.idle
}

type Props = { detail: FilmDetail; collapsible?: boolean }

/** The studio floor: a decorative team of stick figures acting out the film's real pipeline steps. */
export function StudioFloor({ detail, collapsible = false }: Props) {
  const { box, width } = useWidth()
  const motion = !useReducedMotion()
  const floor = useMemo(() => deriveFloor(detail), [detail])
  const frame = useChoreography(floor, motion)
  const chat = useChatter(floor.working, motion)
  const [open, setOpen] = useState(!collapsible)
  const wide = width >= MIN_FLOOR_WIDTH

  const failedLabel = detail.film.status === 'qa_failed' ? vi.status.qa_failed : vi.stepStatus.failed
  const walker = frame?.walker ?? null
  const says: Say[] = [...(frame?.say ?? []), ...(chat ? [chat] : []), ...(floor.note ? [{ who: 'intake' as const, text: floor.note }] : [])]
  const sayAt = (who: Say['who']) => {
    if (who === 'walker') return { left: (walker?.at.x ?? 0) - 10, top: (walker?.at.y ?? 0) - 32 }
    const h = headOf(who)
    return { left: h.x - 10, top: h.y - 42 }
  }

  return (
    <div ref={box} className="studio-floor">
      {wide && collapsible && (
        <button type="button" className="studio-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{vi.studio.show}</button>
      )}
      {wide && open && (
        <>
          <p className="studio-title">{vi.studio.title}</p>
          <p role="status" className="sr-only">{statusLine(floor, failedLabel)}</p>
          <div className="studio-frame" style={{ height: SCENE.height * (width / SCENE.width) }}>
            <div className="studio-scene" aria-hidden="true" style={{ width: SCENE.width, height: SCENE.height, transform: `scale(${width / SCENE.width})` }}>
              <Furniture working={floor.working} final={floor.final} motion={motion} />
              {TEAM.map((m, i) => (
                <Person
                  key={m.key} member={m} index={i} motion={motion}
                  working={floor.working === m.key} cheer={!!frame?.cheer} away={walker?.who === m.key}
                />
              ))}
              <div className={floor.final ? 'studio-you is-final' : 'studio-you'}><span><b>{vi.studio.you}</b> <span>· {vi.studio.youRole}</span></span></div>
              {floor.working && <WorkBubble who={floor.working} title={detail.film.title} />}
              {floor.failed && <WorkBubble who={floor.failed} title={detail.film.title} label={failedLabel} />}
              {walker && <Walker pose={walker} ms={frame!.ms} />}
              {says.map((s) => <span key={`${s.who}-${s.text}`} className="studio-say" style={sayAt(s.who)}>{s.text}</span>)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
