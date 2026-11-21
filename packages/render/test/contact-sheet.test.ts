import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, test } from 'vitest'
import { renderContactSheet, soloTimeline } from '../src/index.js'

const dir = mkdtempSync(join(tmpdir(), 'stick-contact-'))
const tl = soloTimeline('walk_to', 3, 'right')
const SLOW = 60_000

/** RGBA pixels of one grid cell of a rendered sheet (default 4x3 at 0.25 -> 270x640 cells). */
async function cell(file: string, i: number): Promise<Buffer> {
  const img = await loadImage(file)
  const w = img.width / 4
  const h = img.height / 3
  const c = createCanvas(w, h)
  const g = c.getContext('2d')
  g.drawImage(img, (i % 4) * w, Math.floor(i / 4) * h, w, h, 0, 0, w, h)
  return Buffer.from(g.getImageData(0, 0, w, h).data.buffer)
}

describe('renderContactSheet', () => {
  test('contact sheet is cols*scale*1080 by rows*scale*1920', async () => {
    const out = join(dir, 'a.png')
    await renderContactSheet(tl, out)
    const img = await loadImage(out)
    expect([img.width, img.height]).toEqual([1080, 1440])
  }, SLOW)

  test('cells differ when the scene moves', async () => {
    const out = join(dir, 'b.png')
    await renderContactSheet(tl, out)
    expect((await cell(out, 0)).equals(await cell(out, 11))).toBe(false)
  }, SLOW)

  test('is deterministic', async () => {
    const [a, b] = [join(dir, 'c1.png'), join(dir, 'c2.png')]
    await renderContactSheet(tl, a)
    await renderContactSheet(tl, b)
    expect(readFileSync(a).equals(readFileSync(b))).toBe(true)
  }, SLOW)
})
