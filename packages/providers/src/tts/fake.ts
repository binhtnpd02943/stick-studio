import { silentWav, type TtsProvider, type VoiceId } from '@stick/core'
import { estimateLineDuration } from '@stick/pipeline'

export class FakeTts implements TtsProvider {
  readonly id = 'fake'
  async synthesize(text: string, _voice: VoiceId): Promise<Buffer> {
    return silentWav(estimateLineDuration(text))
  }
}
