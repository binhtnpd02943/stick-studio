import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, findApiToken, findUserByEmail, listChannels, primaryMembership, getWorkspace } from '@stick/db'
import { afterAll, describe, expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const TSX = join(ROOT, 'node_modules/.bin/tsx')
const SEED = join(ROOT, 'scripts/seed.ts')
const TOKEN = join(ROOT, 'scripts/create-token.ts')
const tmp = mkdtempSync(join(tmpdir(), 'stick-seed-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

const PASSWORD = 'seed-script-password'

// cwd is a temp dir, so the scripts can never read the repo's .env.
function run(script: string, args: string[], env: Record<string, string>) {
  const cwd = mkdtempSync(join(tmp, 'cwd-'))
  const base = { ...process.env }
  for (const k of ['DATABASE_URL', 'STICK_PGLITE_DIR', 'STICK_SEED_PASSWORD']) delete base[k]
  return spawnSync(TSX, [script, ...args], { encoding: 'utf8', cwd, env: { ...base, ...env } })
}

async function withDb<T>(pgliteDir: string, fn: (db: Awaited<ReturnType<typeof createDb>>['db']) => Promise<T>): Promise<T> {
  const { db, close } = await createDb({ pgliteDir })
  try { return await fn(db) } finally { await close() }
}

describe('seed and token scripts', { timeout: 60_000 }, () => {
  const pgliteDir = join(tmp, 'pglite')
  const env = { STICK_PGLITE_DIR: pgliteDir, STICK_SEED_PASSWORD: PASSWORD }

  test('seed creates user, workspace, owner, channel; second run says already seeded', async () => {
    const first = run(SEED, ['--email', 'Owner@Example.test', '--name', 'Owner', '--workspace', 'Studio'], env)
    expect(first.stderr).toBe('')
    expect(first.status).toBe(0)
    expect(first.stdout).not.toContain(PASSWORD)

    await withDb(pgliteDir, async (db) => {
      const user = (await findUserByEmail(db, 'owner@example.test'))!
      expect(user).toMatchObject({ name: 'Owner' })
      const m = (await primaryMembership(db, user.id))!
      expect(m.role).toBe('owner')
      expect(await getWorkspace(db, m.workspaceId)).toMatchObject({ name: 'Studio', maxCostPerFilmUsd: 1, maxCostPerDayUsd: 10 })
      const { items } = await listChannels(db, m.workspaceId, { limit: 10 })
      expect(items).toEqual([expect.objectContaining({ platform: 'tiktok', displayName: 'TikTok', reviewPolicy: 'manual' })])
    })

    const again = run(SEED, ['--email', 'owner@example.test', '--name', 'Owner'], env)
    expect(again.status).toBe(0)
    expect(again.stdout.trim()).toBe('already seeded: owner@example.test')
  })

  test('token prints a stk_ token that authenticates', async () => {
    const r = run(TOKEN, ['--email', 'owner@example.test', '--name', 'laptop'], { STICK_PGLITE_DIR: pgliteDir })
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    const token = r.stdout.trim()
    expect(token).toMatch(/^stk_[A-Za-z0-9_-]{43}$/)
    await withDb(pgliteDir, async (db) => {
      const principal = await findApiToken(db, token)
      expect(principal).toMatchObject({ role: 'owner', via: 'token' })
    })

    const unknown = run(TOKEN, ['--email', 'nobody@example.test', '--name', 'x'], { STICK_PGLITE_DIR: pgliteDir })
    expect(unknown.status).toBe(1)
    expect(unknown.stdout).toBe('')
    expect(unknown.stderr).toMatch(/unknown email/)
  })

  test('seed without STICK_SEED_PASSWORD exits 1 naming it', () => {
    const r = run(SEED, ['--email', 'x@example.test', '--name', 'X'], { STICK_PGLITE_DIR: join(tmp, 'unused') })
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/STICK_SEED_PASSWORD/)
    const short = run(SEED, ['--email', 'x@example.test', '--name', 'X'], { STICK_PGLITE_DIR: join(tmp, 'unused'), STICK_SEED_PASSWORD: 'short' })
    expect(short.status).toBe(1)
    expect(short.stderr).toMatch(/STICK_SEED_PASSWORD must be at least 12/)
    expect(short.stderr).not.toContain('short\n')
  })

  test('missing arguments print usage that warns about PGlite and npm run dev', () => {
    for (const script of [SEED, TOKEN]) {
      const r = run(script, [], env)
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/usage: npm run (seed|token)/)
      expect(r.stderr).toMatch(/stop npm run dev/)
    }
  })
})
