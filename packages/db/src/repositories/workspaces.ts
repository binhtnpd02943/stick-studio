import { eq } from 'drizzle-orm'
import type { Db } from '../client.js'
import { workspaces } from '../schema.js'
import { toNumber, toNumeric } from './numeric.js'

export interface Workspace {
  id: string
  name: string
  plan: string
  maxCostPerFilmUsd: number | null
  maxCostPerDayUsd: number | null
  createdAt: Date
  updatedAt: Date
}

export function toWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  return { ...row, maxCostPerFilmUsd: toNumber(row.maxCostPerFilmUsd), maxCostPerDayUsd: toNumber(row.maxCostPerDayUsd) }
}

export async function getWorkspace(db: Db, workspaceId: string): Promise<Workspace | undefined> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId))
  return row && toWorkspace(row)
}

export interface WorkspacePatch {
  name?: string
  maxCostPerFilmUsd?: number | null
  maxCostPerDayUsd?: number | null
}

/** `undefined` leaves a field alone; `null` clears a cap so the env default applies again. */
export async function updateWorkspace(db: Db, workspaceId: string, patch: WorkspacePatch): Promise<Workspace | undefined> {
  const [row] = await db.update(workspaces).set({
    name: patch.name,
    maxCostPerFilmUsd: patch.maxCostPerFilmUsd === undefined ? undefined : toNumeric(patch.maxCostPerFilmUsd),
    maxCostPerDayUsd: patch.maxCostPerDayUsd === undefined ? undefined : toNumeric(patch.maxCostPerDayUsd),
  }).where(eq(workspaces.id, workspaceId)).returning()
  return row && toWorkspace(row)
}
