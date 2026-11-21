import { writeFile } from 'node:fs/promises'
import { createCanvas } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { loadRig, registerFonts } from '@stick/engine'
import { defaultCatalog, type Catalog } from '@stick/library'
import { drawFrame } from './director.js'
import { FRAME } from './layout.js'

export interface ContactSheetOptions {
  cols?: number
  rows?: number
  catalog?: Catalog
  scale?: number
  /** Full-frame pixels to keep from each frame; default is the whole frame. */
  crop?: { x: number; y: number; w: number; h: number }
}

const STAMP_PX = 16 // output pixels, independent of scale

/** One PNG grid of `cols*rows` frames at t_i = (i + 0.5) * duration / n, each stamped with its time. */
export async function renderContactSheet(tl: Timeline, outPng: string, opts: ContactSheetOptions = {}): Promise<void> {
  const { cols = 4, rows = 3, catalog = defaultCatalog, scale = 0.25, crop = { x: 0, y: 0, w: FRAME.w, h: FRAME.h } } = opts
  registerFonts()
  const rig = loadRig()
  const n = cols * rows
  const cellW = Math.round(crop.w * scale)
  const cellH = Math.round(crop.h * scale)
  const full = createCanvas(FRAME.w, FRAME.h)
  const sheet = createCanvas(cols * cellW, rows * cellH)
  const g = sheet.getContext('2d')
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) * tl.duration) / n
    drawFrame(full.getContext('2d'), tl, t, rig, catalog)
    const x = (i % cols) * cellW
    const y = Math.floor(i / cols) * cellH
    g.drawImage(full, crop.x, crop.y, crop.w, crop.h, x, y, cellW, cellH)
    g.strokeStyle = '#999999'
    g.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1)
    g.font = `400 ${STAMP_PX}px 'Balsamiq Sans'`
    g.textBaseline = 'top'
    g.fillStyle = '#c0392b'
    g.fillText(`${t.toFixed(2)}s`, x + 4, y + 4)
  }
  await writeFile(outPng, sheet.toBuffer('image/png'))
}
