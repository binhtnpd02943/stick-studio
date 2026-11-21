import { createCanvas } from '@napi-rs/canvas'
import { registerFonts } from '@stick/engine'
import { beforeAll, describe, expect, test } from 'vitest'
import { CAPTION, drawCaption, layoutCaption } from '../src/index.js'

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

  test('overflow is ellipsized', () => {
    const r = layoutCaption(g, words(120))
    expect(r.lines.length).toBe(2)
    expect(r.size).toBe(44)
    expect(r.lines[1]!.endsWith('…')).toBe(true)
    g.font = fontOf(r.size)
    expect(g.measureText(r.lines[1]!).width).toBeLessThanOrEqual(CAPTION.maxWidth)
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
})
