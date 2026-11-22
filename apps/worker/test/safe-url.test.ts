import { describe, expect, test } from 'vitest'
import { urlTarget } from '../src/safe-url.js'

describe('urlTarget', () => {
  test('keeps host and port', () => {
    expect(urlTarget('redis://127.0.0.1:6379')).toBe('127.0.0.1:6379')
    expect(urlTarget('postgres://stick:secret@db.internal/stick')).toBe('db.internal')
  })

  test.each([
    ['at sign', 'redis://:p@ssw0rdAT@cache.example:6379'],
    ['slash', 'redis://user:pa/ssw0rdSL@cache.example:6379'],
    ['colon', 'redis://user:pa:ssw0rdCO@cache.example:6379'],
    ['all three', 'redis://u:a@b/c:ssw0rdALL@cache.example:6379/0'],
    ['not a url', 'ssw0rdNU@cache.example'],
  ])('never prints a password fragment (%s)', (_name, url) => {
    const out = urlTarget(url)
    for (const fragment of ['ssw0rd', 'p@', 'pa/', 'pa:', 'a@b', '/c:', 'user', ':p']) expect(out).not.toContain(fragment)
  })
})
