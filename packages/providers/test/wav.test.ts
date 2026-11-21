import { describe, expect, it } from 'vitest'
import { silentWav, wavSeconds } from '../src/wav.js'

describe('wav', () => {
  it('wavSeconds of silentWav(1.5) is about 1.5', () => {
    expect(wavSeconds(silentWav(1.5))).toBeCloseTo(1.5, 3)
  })

  it('wavSeconds skips a FLLR chunk', () => {
    const w = silentWav(2)
    const fllr = Buffer.alloc(8 + 4000)
    fllr.write('FLLR', 0, 'ascii')
    fllr.writeUInt32LE(4000, 4)
    // splice FLLR between fmt (ends at 36) and data
    const buf = Buffer.concat([w.subarray(0, 36), fllr, w.subarray(36)])
    buf.writeUInt32LE(buf.length - 8, 4)
    expect(wavSeconds(buf)).toBeCloseTo(2, 3)
  })

  it('wavSeconds throws on garbage', () => {
    expect(() => wavSeconds(Buffer.from('definitely not a wav file at all'))).toThrow('not a PCM WAV')
    expect(() => wavSeconds(Buffer.alloc(0))).toThrow('not a PCM WAV')
  })

  it('wavSeconds throws on a file with no data chunk', () => {
    expect(() => wavSeconds(silentWav(1).subarray(0, 36))).toThrow('not a PCM WAV')
  })
})
