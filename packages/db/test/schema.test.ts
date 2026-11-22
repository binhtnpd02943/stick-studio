import { FILM_STATUSES, FILM_STEPS } from '@stick/core'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { Db } from '../src/index.js'
import { createTestDb } from '../src/testing.js'

let db: Db
let close: () => Promise<void>
beforeAll(async () => {
  ;({ db, close } = await createTestDb())
})
afterAll(() => close())

const rows = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as { rows: Record<string, string>[] }).rows

const P1_TABLES = [
  'users', 'workspaces', 'workspace_members', 'api_tokens', 'sessions', 'channels', 'characters',
  'films', 'film_versions', 'step_runs', 'assets', 'reviews', 'usage_events', 'audit_log',
]

describe('schema', () => {
  test('migrations apply on a fresh PGlite and create every P1 table', async () => {
    const found = (await rows(sql`select table_name from information_schema.tables where table_schema = 'public'`)).map((r) => r.table_name)
    for (const t of P1_TABLES) expect(found, t).toContain(t)
  })

  test('every table has created_at and updated_at as timestamptz', async () => {
    const cols = await rows(sql`select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and column_name in ('created_at', 'updated_at') and data_type = 'timestamp with time zone'`)
    for (const t of P1_TABLES) {
      expect(cols.filter((c) => c.table_name === t).map((c) => c.column_name).sort(), t).toEqual(['created_at', 'updated_at'])
    }
  })

  test('ids are uuid v7', async () => {
    const { seedWorkspace } = await import('../src/testing.js')
    const a = await seedWorkspace(db)
    const b = await seedWorkspace(db)
    expect(a.workspace.id[14]).toBe('7')
    expect(a.workspace.id < b.workspace.id).toBe(true)
  })

  test('the spec indexes exist', async () => {
    const names = (await rows(sql`select indexname from pg_indexes where schemaname = 'public'`)).map((r) => r.indexname)
    expect(names).toEqual(expect.arrayContaining([
      'films_workspace_status_created_idx', 'films_workspace_idempotency_key_idx', 'step_runs_version_step_idx',
      'usage_events_workspace_created_idx', 'assets_film_version_idx', 'sessions_expires_at_idx',
    ]))
  })

  test('a step outside FILM_STEPS is rejected by the CHECK', async () => {
    // drizzle wraps the driver error; the constraint name is on the cause
    const err = await db.execute(sql`insert into step_runs (id, film_version_id, step, attempt, status)
      values (gen_random_uuid(), gen_random_uuid(), 'align', 1, 'pending')`).catch((e: Error & { cause?: Error }) => e)
    expect((err as Error & { cause?: Error }).cause?.message).toMatch(/step_runs_step_check/)
  })

  test('CHECK value lists match FILM_STEPS and FILM_STATUSES', async () => {
    const defs = await rows(sql`select pg_get_constraintdef(oid) as def from pg_constraint
      where conname in ('step_runs_step_check', 'film_versions_restart_from_step_check', 'films_status_check')`)
    const quoted = (def: string) => [...def.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    const lists = defs.map((d) => quoted(d.def!))
    expect(lists).toContainEqual([...FILM_STATUSES])
    expect(lists.filter((l) => l.join() === [...FILM_STEPS].join())).toHaveLength(2)
  })
})

describe('createDb', () => {
  test('with a url it uses node-postgres and surfaces a connection failure instead of hanging', async () => {
    const { createDb } = await import('../src/client.js')
    await expect(createDb({ url: 'postgres://stick:x@127.0.0.1:1/none' })).rejects.toThrow(/ECONNREFUSED|connect/i)
  })

  test('pgliteDir persists data across opens', async () => {
    const { createDb } = await import('../src/client.js')
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = join(mkdtempSync(join(tmpdir(), 'stick-pglite-')), 'db')
    const first = await createDb({ pgliteDir: dir })
    await first.db.execute(sql`insert into users (id, email, name, password_hash) values (gen_random_uuid(), 'p@x.test', 'P', 'h')`)
    await first.close()
    const second = await createDb({ pgliteDir: dir })
    const r = (await second.db.execute(sql`select email from users`)) as { rows: { email: string }[] }
    expect(r.rows.map((x) => x.email)).toEqual(['p@x.test'])
    await second.close()
  }, 30_000) // two real-file PGlite boots; took 9 s under full-suite load vs the 5 s default
})

describe('errors and paging', () => {
  test('ConflictError carries a code and details; NotFoundError has code not_found', async () => {
    const { ConflictError, NotFoundError } = await import('../src/errors.js')
    expect(new ConflictError('dup', 'm', { k: 1 })).toMatchObject({ code: 'dup', details: { k: 1 }, message: 'm' })
    expect(new NotFoundError()).toMatchObject({ code: 'not_found', message: 'not found' })
  })

  test('page trims the extra row and returns the last kept id as cursor', async () => {
    const { page } = await import('../src/pagination.js')
    expect(page([{ id: 'c' }, { id: 'b' }, { id: 'a' }], 2)).toEqual({ items: [{ id: 'c' }, { id: 'b' }], nextCursor: 'b' })
    expect(page([{ id: 'a' }], 2)).toEqual({ items: [{ id: 'a' }], nextCursor: null })
    expect(page([], 2)).toEqual({ items: [], nextCursor: null })
  })
})

describe('table definitions', () => {
  test('every table declares its checks and indexes (extra config resolves)', async () => {
    const { getTableConfig } = await import('drizzle-orm/pg-core')
    const schema = await import('../src/schema.js')
    const configs = Object.values(schema).map((t) => getTableConfig(t as Parameters<typeof getTableConfig>[0]))
    expect(configs.map((c) => c.name).sort()).toEqual([...P1_TABLES].sort())
    const withChecks = configs.filter((c) => c.checks.length > 0).map((c) => c.name)
    // each FK resolves to a real table
    const fkTargets = configs.flatMap((c) => c.foreignKeys.map((fk) => getTableConfig(fk.reference().foreignTable).name))
    expect(fkTargets.length).toBeGreaterThan(0)
    for (const target of fkTargets) expect(P1_TABLES).toContain(target)
    expect(withChecks).toEqual(expect.arrayContaining(['films', 'step_runs', 'film_versions', 'channels', 'reviews', 'workspace_members']))
  })
})
