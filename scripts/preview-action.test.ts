import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const cli = (args: string[]) => spawnSync('npx', ['tsx', 'scripts/preview-action.ts', ...args], { encoding: 'utf8' })

describe('preview-action CLI', () => {
  test('preview wave writes out/preview/wave.png', () => {
    rmSync('out/preview/wave.png', { force: true })
    const r = cli(['wave'])
    expect(r.status, r.stdout + r.stderr).toBe(0)
    expect(existsSync('out/preview/wave.png')).toBe(true)
  }, 60_000)

  test('near:desk without --prop exits 1', () => {
    const r = cli(['point_at', '--target', 'near:desk'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--prop desk')
  }, 60_000)
})
