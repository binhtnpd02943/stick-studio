const bad = () => new Error('not a PCM WAV')

/** Seconds of audio in a PCM WAV: walks RIFF chunks, skipping any it does not know (e.g. FLLR). */
export function wavSeconds(buf: Buffer): number {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw bad()
  let byteRate = 0
  for (let p = 12; p + 8 <= buf.length; ) {
    const id = buf.toString('ascii', p, p + 4)
    const size = buf.readUInt32LE(p + 4)
    if (id === 'fmt ' && p + 20 <= buf.length) {
      if (buf.readUInt16LE(p + 8) !== 1) throw bad()
      byteRate = buf.readUInt32LE(p + 16)
    } else if (id === 'data') {
      if (byteRate <= 0) throw bad()
      return Math.min(size, buf.length - p - 8) / byteRate
    }
    p += 8 + size + (size & 1)
  }
  throw bad()
}

/** 16-bit mono PCM silence. */
export function silentWav(seconds: number, sampleRate = 22050): Buffer {
  const data = Buffer.alloc(Math.round(seconds * sampleRate) * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0, 'ascii')
  h.writeUInt32LE(36 + data.length, 4)
  h.write('WAVEfmt ', 8, 'ascii')
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36, 'ascii')
  h.writeUInt32LE(data.length, 40)
  return Buffer.concat([h, data])
}
