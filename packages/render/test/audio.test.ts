import { mkdtempSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { muxAudio } from '../src/index.js'

describe('muxAudio', () => {
  test('muxAudio refuses to overwrite its source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stick-audio-'))
    const source = join(dir, 'film.mp4')
    writeFileSync(source, 'stand-in video bytes')

    await expect(muxAudio(source, [], source)).rejects.toThrow(
      'muxAudio: outPath must differ from videoPath',
    )
    expect(existsSync(source)).toBe(true)
  })
})
