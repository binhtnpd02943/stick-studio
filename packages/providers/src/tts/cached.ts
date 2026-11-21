import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { wavSeconds, type TtsProvider, type VoiceId } from '@stick/core'

const usable = (buf: Buffer): boolean => {
  try {
    return wavSeconds(buf) > 0
  } catch {
    return false
  }
}

/** Content-hash cache: a corrupt or empty cached file is regenerated, and writes are atomic (temp + rename). */
export function cachedTts(inner: TtsProvider, dir: string): TtsProvider {
  return {
    id: inner.id,
    async synthesize(text: string, voice: VoiceId): Promise<Buffer> {
      const hash = createHash('sha256').update(`${inner.id}\0${voice}\0${text}`).digest('hex')
      const file = join(dir, `${hash}.wav`)
      const hit = await readFile(file).catch(() => undefined)
      if (hit && usable(hit)) return hit
      const wav = await inner.synthesize(text, voice)
      await mkdir(dir, { recursive: true })
      const tmp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`
      try {
        await writeFile(tmp, wav)
        await rename(tmp, file)
      } catch (e) {
        await rm(tmp, { force: true })
        throw e
      }
      return wav
    },
  }
}
