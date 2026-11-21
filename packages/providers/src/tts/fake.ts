import { estimateLineDuration, silentWav, type TtsProvider, type VoiceId } from '@stick/core'

export class FakeTts implements TtsProvider {
  readonly id = 'fake'
  async synthesize(text: string, _voice: VoiceId): Promise<Buffer> {
    return silentWav(estimateLineDuration(text))
  }
}
