import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beatId, VOICE_IDS, wavSeconds, type Screenplay, type TtsProvider, type VoiceId } from '@stick/core'

const isVoice = (v: string): v is VoiceId => (VOICE_IDS as readonly string[]).includes(v)

/** Voices every spoken beat to `<outDir>/<beatId>.wav` and returns beat id -> seconds for solveTimeline. */
export async function voiceScreenplay(sp: Screenplay, tts: TtsProvider, outDir: string): Promise<Record<string, number>> {
  const voiceOf = new Map(sp.cast.map((c) => [c.id, c.voice]))
  await mkdir(outDir, { recursive: true })
  const durations: Record<string, number> = {}
  for (const scene of sp.scenes) {
    for (const [i, beat] of scene.beats.entries()) {
      if (!beat.say) continue
      const raw = voiceOf.get(beat.say.who) ?? ''
      if (!isVoice(raw)) console.error(`warning: unknown voice "${raw}" for ${beat.say.who}, using narrator`)
      const wav = await tts.synthesize(beat.say.text, isVoice(raw) ? raw : 'narrator')
      const id = beatId(scene.id, i)
      await writeFile(join(outDir, `${id}.wav`), wav)
      durations[id] = wavSeconds(wav)
    }
  }
  return durations
}
