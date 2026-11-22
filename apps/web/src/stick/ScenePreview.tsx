import type { Timeline } from '@stick/core'
import { defaultCatalog } from '@stick/library'
import { drawFrame, FRAME } from '@stick/render/frame'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { fontsReady, rig } from './rig'
import { createScenePlayer } from './scene-player'
import { idleTimeline } from './timelines'
import { useReducedMotion } from './use-reduced-motion'

const FRAME_MS = 1000 / 30
const FRAME_SLACK_MS = 4 // rAF timestamps jitter; without slack a 60 Hz screen drops to 20 fps

interface Props {
  timeline: Timeline
  idle?: Timeline
  trigger: 'hover' | 'view' | 'none'
  /** Required when interactive; a non-interactive preview is decorative (aria-hidden). */
  label?: string
  interactive?: boolean
}

export function ScenePreview({ timeline, idle, trigger, label, interactive = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const playRef = useRef(() => {})
  const reducedMotion = useReducedMotion()
  const idleTl = useMemo(() => idle ?? idleTimeline(timeline), [idle, timeline])

  useEffect(() => {
    const canvas = ref.current
    const g = canvas?.getContext('2d')
    // shortcut: no IntersectionObserver (jsdom) means the canvas stays blank paper; every target browser has it.
    if (!canvas || !g || typeof IntersectionObserver === 'undefined') return
    const player = createScenePlayer({ actionDuration: timeline.duration, idleDuration: idleTl.duration, reducedMotion })
    let raf = 0
    let last = -Infinity
    let ready = false
    let visible = false
    let seen = false
    let stopped = false

    const draw = (now: number) => {
      const f = player.frame(now)
      const w = Math.round(canvas.clientWidth * devicePixelRatio)
      if (w && w !== canvas.width) {
        canvas.width = w
        canvas.height = Math.round((w * FRAME.h) / FRAME.w)
      }
      try {
        g.setTransform(canvas.width / FRAME.w, 0, 0, canvas.height / FRAME.h, 0, 0)
        drawFrame(g, f.which === 'idle' ? idleTl : timeline, f.t, rig, defaultCatalog)
      } catch (e) {
        stopped = true
        canvas.width = canvas.width // resets the context: blank paper, balanced save/restore
        console.warn(`ScenePreview: could not draw "${timeline.title ?? '(untitled)'}"`, e)
      }
    }
    const tick = (now: number) => {
      raf = 0
      if (stopped || !visible) return
      if (now - last >= FRAME_MS - FRAME_SLACK_MS) {
        last = now
        draw(now)
      }
      if (!stopped && player.looping()) raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (ready && visible && !raf && !stopped) raf = requestAnimationFrame(tick)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }
    playRef.current = () => {
      player.play(performance.now())
      last = -Infinity
      start()
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
      if (!visible) return stop()
      if (!seen && trigger === 'view' && !reducedMotion) player.play(performance.now())
      seen = true
      start()
    })
    io.observe(canvas)
    void fontsReady().then(() => {
      ready = true
      start()
    })
    return () => {
      stopped = true
      io.disconnect()
      stop()
      playRef.current = () => {}
    }
  }, [timeline, idleTl, trigger, reducedMotion])

  const play = () => playRef.current()
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    play()
  }
  const a11y = interactive
    ? { role: 'img', 'aria-label': label, tabIndex: 0, onClick: play, onKeyDown }
    : { 'aria-hidden': true }
  return (
    <canvas
      ref={ref}
      className="scene-preview"
      onPointerEnter={trigger === 'hover' && !reducedMotion ? play : undefined}
      {...a11y}
    />
  )
}
