import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, test } from 'vitest'
import { createDb } from '../src/client.js'
import { TEST_DATABASE_URL, createTempDatabase } from '../src/testing.js'

const MIGRATION_FILES = readdirSync(new URL('../migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).length

// Runs only against real Postgres: set STICK_TEST_DATABASE_URL (npm run test:db:pg).
describe.skipIf(!TEST_DATABASE_URL)('postgres only (needs STICK_TEST_DATABASE_URL)', () => {
  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((c) => c()))
  })
  const tempDb = async () => {
    const t = await createTempDatabase(TEST_DATABASE_URL!)
    cleanups.push(t.drop)
    return t
  }

  test('concurrent createDb calls all succeed and migrations are applied once', async () => {
    const { url } = await tempDb()
    const handles = await Promise.all([1, 2, 3, 4].map(() => createDb({ url })))
    cleanups.unshift(async () => { await Promise.all(handles.map((h) => h.close())) })
    const r = (await handles[0]!.db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as { rows: { n: number }[] }
    expect(r.rows[0]!.n).toBe(MIGRATION_FILES)
  }, 30_000)

  test('a failing migration rejects promptly instead of hanging on the pool', async () => {
    const { url } = await tempDb()
    const dir = mkdtempSync(join(tmpdir(), 'stick-bad-migration-'))
    mkdirSync(join(dir, 'meta'))
    writeFileSync(join(dir, '0000_bad.sql'), 'this is not sql;')
    writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({
      version: '7', dialect: 'postgresql', entries: [{ idx: 0, version: '7', when: 1, tag: '0000_bad', breakpoints: true }],
    }))
    await expect(createDb({ url, migrationsFolder: dir })).rejects.toThrow()
    // the advisory lock died with its connection, so a good run right after is not blocked
    const ok = await createDb({ url })
    await ok.close()
  }, 10_000)
})
