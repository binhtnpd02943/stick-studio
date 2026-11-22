import type { FilmStep } from '@stick/core'
import type { Db } from '../client.js'
import { reviews } from '../schema.js'

export type Review = typeof reviews.$inferSelect

// No workspaceId: reviews has none, and callers reach the version id only after a scoped film lookup.
export async function insertReview(db: Db, input: {
  filmVersionId: string
  reviewerId: string
  decision: 'approved' | 'redo'
  reason?: string
  redoFromStep?: FilmStep
}): Promise<Review> {
  const [row] = await db.insert(reviews).values(input).returning()
  return row!
}
