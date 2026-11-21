import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { TtsProvider, VoiceId } from '@stick/core'

const run = promisify(execFile)
const SAY_TIMEOUT_MS = 60_000

/** Words per minute. Linh is the only vi_VN voice, so roles differ by rate only. */
export const VOICE_RATES: Record<VoiceId, number> = {
  narrator: 175,
  female_young: 185,
  male_young: 165,
  female_old: 160,
  male_old: 150,
  child: 200,
}

/** `say` runs embedded [[slnc]]/[[rate]]/[[volm]] commands, so no two adjacent `[` may survive. */
export const neutraliseSayCommands = (text: string): string => text.replace(/\[(?=\[)/g, '[ ')

/** macOS `say -v Linh`. Text goes through a UTF-8 file (`-f`) and an args array: never parsed as a flag or by a shell. */
export class SayTts implements TtsProvider {
  readonly id = 'macos-say-linh'
  async synthesize(text: string, voice: VoiceId): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'stick-say-'))
    try {
      const txt = join(dir, 'line.txt')
      const wav = join(dir, 'line.wav')
      await writeFile(txt, neutraliseSayCommands(text), 'utf8')
      await run('say', ['-v', 'Linh', '-r', String(VOICE_RATES[voice]), '-f', txt, '-o', wav, '--data-format=LEI16@22050'], { timeout: SAY_TIMEOUT_MS })
      return await readFile(wav)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
