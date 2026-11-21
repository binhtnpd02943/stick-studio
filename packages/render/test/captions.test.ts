import { createCanvas } from '@napi-rs/canvas'
import { registerFonts } from '@stick/engine'
import { beforeAll, describe, expect, test } from 'vitest'
import { CAPTION, drawCaption, layoutCaption, pageCaption } from '../src/index.js'

const SENTENCE = 'Hôm nay chúng ta sẽ học cách cộng hai phân số có mẫu số khác nhau bằng cách quy đồng trước'
const words = (n: number) => Array.from({ length: n }, (_, i) => SENTENCE.split(' ')[i % 19]).join(' ')

const canvas = createCanvas(1080, 1920)
const g = canvas.getContext('2d')
const fontOf = (size: number) => `400 ${size}px 'Balsamiq Sans'`

beforeAll(() => registerFonts())

describe('layoutCaption', () => {
  test('short line stays one line at 60', () => {
    const r = layoutCaption(g, 'Lan ơi, phân số là gì vậy?')
    expect(r.lines.length).toBe(1)
    expect(r.size).toBe(60)
  })

  test('long line wraps', () => {
    const r = layoutCaption(g, words(30))
    expect(r.lines.length).toBeLessThanOrEqual(2)
    expect(r.size).toBeGreaterThanOrEqual(44)
    g.font = fontOf(r.size)
    for (const line of r.lines) expect(g.measureText(line).width).toBeLessThanOrEqual(CAPTION.maxWidth)
  })

  test('long line is paged', () => {
    const text = words(120)
    const pages = pageCaption(g, text)
    expect(pages.length).toBeGreaterThanOrEqual(3)
    for (const p of pages) {
      expect(p.lines.length).toBeLessThanOrEqual(2)
      g.font = fontOf(p.size)
      for (const line of p.lines) expect(g.measureText(line).width).toBeLessThanOrEqual(CAPTION.maxWidth)
    }
    expect(pages.map((p) => p.text).join(' ')).toBe(text)
  })

  test('text that fits stays a single page', () => {
    expect(pageCaption(g, words(12))).toHaveLength(1)
  })
})

describe('drawCaption', () => {
  const pixel = () => Array.from(g.getImageData(CAPTION.cx, CAPTION.y, 1, 1).data)
  const reset = () => {
    g.fillStyle = '#336699'
    g.fillRect(0, 0, 1080, 1920)
  }

  test('draws nothing outside its window', () => {
    reset()
    const before = pixel()
    drawCaption(g, 'Lan ơi', 2, 1, 2)
    drawCaption(g, 'Lan ơi', 0.5, 1, 2)
    expect(pixel()).toEqual(before)
  })

  test('draws a box inside its window and fades in', () => {
    reset()
    const before = pixel()
    drawCaption(g, 'Lan ơi', 1.5, 1, 2)
    const full = pixel()
    expect(full).not.toEqual(before)
    reset()
    drawCaption(g, 'Lan ơi', 1.03, 1, 2)
    const partial = pixel()
    expect(partial).not.toEqual(before)
    expect(partial).not.toEqual(full)
  })

  test('pages split the window by length', () => {
    const text = words(120)
    const pages = pageCaption(g, text)
    const total = pages.reduce((n, p) => n + p.text.length, 0)
    const region = () => g.getImageData(0, 1300, 1080, 300).data
    const t = (12 * (pages[0]!.text.length + pages[1]!.text.length / 2)) / total
    reset()
    drawCaption(g, text, t, 0, 12)
    const drawn = Buffer.from(region())
    reset()
    drawCaption(g, pages[1]!.text, 6, 0, 12)
    expect(drawn.equals(Buffer.from(region()))).toBe(true)
  })
})
