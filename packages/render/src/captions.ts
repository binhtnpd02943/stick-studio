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

export interface CaptionPage { lines: string[]; size: number; text: string }

function layoutWords(g: SKRSContext2D, words: string[]): { lines: string[]; size: number; truncated: boolean } {
  registerFonts()
  g.save()
  try {
    for (let size = CAPTION.size; size >= CAPTION.minSize; size -= SIZE_STEP) {
      g.font = fontOf(size)
      const lines = wrap(g, words)
      if (lines.length <= CAPTION.maxLines) return { lines, size, truncated: false }
    }
    // Only a single page with a giant word still lands here; pageCaption keeps every other line whole.
    g.font = fontOf(CAPTION.minSize)
    return { lines: ellipsize(g, wrap(g, words)), size: CAPTION.minSize, truncated: true }
  } finally {
    g.restore()
  }
}

const splitWords = (text: string): string[] => text.split(/\s+/).filter(Boolean)

export function layoutCaption(g: SKRSContext2D, text: string): { lines: string[]; size: number } {
  const { lines, size } = layoutWords(g, splitWords(text))
  return { lines, size }
}

const countWords = (lines: string[]): number => lines.reduce((n, l) => n + l.split(' ').length, 0)

/** One page when the text fits layoutCaption's 2 lines; otherwise pages that each fill 2 lines at pageSize. */
export function pageCaption(g: SKRSContext2D, text: string): CaptionPage[] {
  const all = splitWords(text)
  const whole = layoutWords(g, all)
  if (!whole.truncated) return [{ lines: whole.lines, size: whole.size, text: all.join(' ') }]
  const pages: CaptionPage[] = []
  let rest = all
  g.save()
  g.font = fontOf(CAPTION.pageSize)
  while (rest.length > 0) {
    const n = countWords(wrap(g, rest).slice(0, CAPTION.maxLines))
    const pageText = rest.slice(0, n).join(' ')
    pages.push({ ...layoutCaption(g, pageText), text: pageText })
    rest = rest.slice(n)
  }
  g.restore()
  return pages
}

/** The page whose share of the window (by character count) contains t. */
function pageAt(pages: CaptionPage[], t: number, start: number, end: number): CaptionPage {
  const total = pages.reduce((n, p) => n + p.text.length, 0)
  const at = ((t - start) / (end - start)) * total
  let acc = 0
  for (const p of pages) {
    acc += p.text.length
    if (at < acc) return p
  }
  return pages.at(-1)!
}

function drawPage(g: SKRSContext2D, { lines, size }: CaptionPage, alpha: number): void {
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

/** Fades only at the line's own start and end; pages hard-cut. */
export function drawCaption(g: SKRSContext2D, text: string, t: number, lineStart: number, lineEnd: number): void {
  if (t < lineStart || t >= lineEnd) return
  const alpha = Math.max(0, Math.min(1, (t - lineStart) / FADE, (lineEnd - t) / FADE))
  drawPage(g, pageAt(pageCaption(g, text), t, lineStart, lineEnd), alpha)
}
