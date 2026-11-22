import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import * as schema from './schema.js'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url))
// Held while migrating so the API and the worker cannot race on a shared Postgres.
const MIGRATION_LOCK = 72_74_01

export interface CreateDbOptions {
  url?: string
  pgliteDir?: string
  /** Test seam: defaults to the committed `packages/db/migrations`. */
  migrationsFolder?: string
}

export async function createDb(opts: CreateDbOptions = {}): Promise<{ db: Db; close(): Promise<void> }> {
  const migrationsFolder = opts.migrationsFolder ?? MIGRATIONS
  if (opts.url) return createPostgresDb(opts.url, migrationsFolder)
  const client = new PGlite(opts.pgliteDir ?? 'memory://')
  const db = drizzlePglite(client, { schema })
  await migratePglite(db, { migrationsFolder })
  return { db, close: () => client.close() }
}

async function createPostgresDb(url: string, migrationsFolder: string) {
  const pool = new pg.Pool({ connectionString: url })
  try {
    await migrateUnderLock(pool, migrationsFolder)
  } catch (err) {
    await pool.end()
    throw err
  }
  return { db: drizzlePg(pool, { schema }) as Db, close: () => pool.end() }
}

async function migrateUnderLock(pool: pg.Pool, migrationsFolder: string) {
  const locker = await pool.connect()
  // pool.end() waits for checked-out clients, so the locker must be released before any caller ends the pool.
  // A failed connection is destroyed (release(true)), which also drops its session-level advisory lock.
  let broken = false
  try {
    await locker.query('select pg_advisory_lock($1)', [MIGRATION_LOCK])
    await migratePg(drizzlePg(locker, { schema }), { migrationsFolder })
    await locker.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK])
  } catch (err) {
    broken = true
    throw err
  } finally {
    locker.release(broken)
  }
}
