import { rm } from 'node:fs/promises'
import type { Writable } from 'node:stream'
import { createCanvas } from '@napi-rs/canvas'
import type { Timeline } from '@stick/core'
import { loadRig, registerFonts } from '@stick/engine'
import { defaultCatalog, type Catalog } from '@stick/library'
import { drawFrame } from './director.js'
import { killAndWait, runFfmpeg } from './ffmpeg.js'
import { FRAME } from './layout.js'

const FPS = 30

export interface RenderOptions {
  ffmpegPath?: string
  catalog?: Catalog
  onProgress?: (frame: number, total: number) => void
}

// Not events.once: it would reject with EPIPE and hide ffmpeg's stderr tail carried by `done`.
const drained = (w: Writable) => new Promise<void>((r) => w.once('drain', r))

const encodeArgs = (out: string): string[] => [
  '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${FRAME.w}x${FRAME.h}`, '-r', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', out,
]

/** Renders every frame of `tl` into an H.264 mp4. `seconds` is wall time (render speed metric). */
export async function renderVideo(
  tl: Timeline,
  outPath: string,
  opts: RenderOptions = {},
): Promise<{ frames: number; seconds: number }> {
  const { ffmpegPath = 'ffmpeg', catalog = defaultCatalog, onProgress } = opts
  const started = performance.now()
  const frames = Math.ceil(tl.duration * FPS - 1e-9)
  registerFonts()
  const rig = loadRig()
  const canvas = createCanvas(FRAME.w, FRAME.h)
  const g = canvas.getContext('2d')
  const run = runFfmpeg(ffmpegPath, encodeArgs(outPath))
  const { child, done } = run
  let exited = false
  done.then(() => (exited = true), () => (exited = true))
  try {
    for (let i = 0; i < frames && !exited; i++) {
      drawFrame(g, tl, i / FPS, rig, catalog)
      if (!child.stdin.write(canvas.data())) await Promise.race([drained(child.stdin), done])
      onProgress?.(i + 1, frames)
    }
    child.stdin.end()
    await done
  } catch (e) {
    child.stdin.destroy()
    await killAndWait(run)
    await rm(outPath, { force: true })
    throw e
  }
  return { frames, seconds: (performance.now() - started) / 1000 }
}
