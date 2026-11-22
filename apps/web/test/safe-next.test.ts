import { describe, expect, test } from 'vitest'
import { safeNext } from '../src/safe-next'

describe('safeNext', () => {
  test.each([
    ['/films', '/films'],
    ['/films?status=failed#x', '/films?status=failed#x'],
    [null, '/'],
    ['', '/'],
  ])('keeps %s as %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })

  test.each([
    '//evil.example', 'https://evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example',
    '/.//evil.example', '/a/..//evil.example', '/%2e//evil.example', 'http://', 'https://[',
  ])('%j never leaves this origin', (input) => {
    const out = safeNext(input)
    expect(out).toMatch(/^\/(?![/\\])/)
    expect(new URL(out, window.location.origin).origin).toBe(window.location.origin)
  })
})
