import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

const STDERR_LINES = 20

export interface FfmpegRun {
  child: ChildProcessByStdio<Writable, null, Readable>
  /** Resolves on exit code 0; rejects with the last stderr lines on spawn error or non-zero exit. */
  done: Promise<void>
}

export function runFfmpeg(ffmpegPath: string, args: string[]): FfmpegRun {
  const child = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  const tail: string[] = []
  let partial = ''
  child.stderr.on('data', (chunk: Buffer) => {
    const lines = (partial + chunk.toString()).split(/\r?\n|\r/)
    partial = lines.pop() ?? ''
    tail.push(...lines)
    if (tail.length > STDERR_LINES) tail.splice(0, tail.length - STDERR_LINES)
  })
  // EPIPE when ffmpeg exits early: `done` carries the real reason.
  child.stdin.on('error', () => {})
  const done = new Promise<void>((resolve, reject) => {
    const fail = (why: string) => reject(new Error(`ffmpeg ${why}\n${[...tail, partial].filter(Boolean).slice(-STDERR_LINES).join('\n')}`))
    child.on('error', (e) => fail(`failed to start: ${e.message}`))
    child.on('close', (code) => (code === 0 ? resolve() : fail(`exited with code ${code}`)))
  })
  return { child, done }
}
