import type { SKRSContext2D } from '@napi-rs/canvas'
import { registerFonts } from '@stick/engine'
import { CAPTION } from './layout.js'

const INK = '#141414'
const BOX_FILL = '#ffffff'
const STROKE_W = 1.5
const PAD = 24
const RADIUS = 20
const LINE_HEIGHT = 1.2
const FADE = 0.12
const SIZE_STEP = 2
const ELLIPSIS = '…'

const fontOf = (size: number) => `400 ${size}px 'Balsamiq Sans'`

/** Greedy wrap. shortcut: a single word wider than maxWidth overflows its line, fine for Vietnamese syllables. */
function wrap(g: SKRSContext2D, words: string[]): string[] {
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (cur && g.measureText(next).width > CAPTION.maxWidth) {
      lines.push(cur)
      cur = w
    } else cur = next
  }
  return cur ? [...lines, cur] : lines
}

/** Keep the first maxLines lines; end the last with an ellipsis that still fits. */
function ellipsize(g: SKRSContext2D, lines: string[]): string[] {
  const kept = lines.slice(0, CAPTION.maxLines)
  const words = (kept.at(-1) ?? '').split(' ')
  while (words.length > 1 && g.measureText(`${words.join(' ')}${ELLIPSIS}`).width > CAPTION.maxWidth) words.pop()
  return [...kept.slice(0, -1), `${words.join(' ')}${ELLIPSIS}`]
}

export function layoutCaption(g: SKRSContext2D, text: string): { lines: string[]; size: number } {
  registerFonts()
  const words = text.split(/\s+/).filter(Boolean)
  g.save()
  try {
    for (let size = CAPTION.size; size >= CAPTION.minSize; size -= SIZE_STEP) {
      g.font = fontOf(size)
      const lines = wrap(g, words)
      if (lines.length <= CAPTION.maxLines) return { lines, size }
    }
    g.font = fontOf(CAPTION.minSize)
    return { lines: ellipsize(g, wrap(g, words)), size: CAPTION.minSize }
  } finally {
    g.restore()
  }
}

export function drawCaption(g: SKRSContext2D, text: string, t: number, lineStart: number, lineEnd: number): void {
  if (t < lineStart || t >= lineEnd) return
  const { lines, size } = layoutCaption(g, text)
  const alpha = Math.max(0, Math.min(1, (t - lineStart) / FADE, (lineEnd - t) / FADE))
  const lineH = size * LINE_HEIGHT
  g.save()
  g.globalAlpha = alpha
  g.font = fontOf(size)
  const textW = Math.max(...lines.map((l) => g.measureText(l).width))
  const w = textW + PAD * 2
  const h = lineH * lines.length + PAD * 2
  g.beginPath()
  g.roundRect(CAPTION.cx - w / 2, CAPTION.y - h / 2, w, h, RADIUS)
  g.fillStyle = BOX_FILL
  g.fill()
  g.lineWidth = STROKE_W
  g.strokeStyle = INK
  g.stroke()
  g.fillStyle = INK
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const top = CAPTION.y - (lineH * lines.length) / 2
  lines.forEach((l, i) => g.fillText(l, CAPTION.cx, top + lineH * (i + 0.5)))
  g.restore()
}
