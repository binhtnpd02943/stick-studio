import { describe, expect, test } from 'vitest'
import { downloadName, formatDuration, relativeTime } from '../src/components/format'

describe('downloadName', () => {
  test('the title becomes an .mp4 name with characters illegal in file names replaced', () => {
    expect(downloadName('Phân số là gì?')).toBe('Phân số là gì.mp4')
    expect(downloadName('A/B\\C:D*E"F<G>H|I')).toBe('A-B-C-D-E-F-G-H-I.mp4')
    expect(downloadName('  .. Tab\tand\nnewline ..  ')).toBe('Tab-and-newline.mp4')
  })

  test('a title with nothing usable falls back to a plain name', () => {
    expect(downloadName('???')).toBe('phim.mp4')
    expect(downloadName('   ')).toBe('phim.mp4')
  })
})

describe('formatDuration and relativeTime', () => {
  test('durations floor to m:ss', () => {
    expect(formatDuration(25.9)).toBe('0:25')
    expect(formatDuration(61)).toBe('1:01')
  })

  test('ages read in user words', () => {
    const now = Date.parse('2026-11-22T12:00:00.000Z')
    expect(relativeTime('2026-11-22T11:59:30.000Z', now)).toBe('mới đây')
    expect(relativeTime('2026-11-22T11:50:00.000Z', now)).toBe('10 phút trước')
    expect(relativeTime('2026-11-22T10:00:00.000Z', now)).toBe('2 giờ trước')
    expect(relativeTime('2026-11-21T10:00:00.000Z', now)).toBe('Hôm qua')
  })
})
