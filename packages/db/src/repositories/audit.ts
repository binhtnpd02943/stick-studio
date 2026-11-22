import { type Db } from '../client.js'
import { auditLog } from '../schema.js'

export async function audit(
  db: Db,
  workspaceId: string,
  event: { actorId?: string; action: string; target: string; data?: unknown },
): Promise<void> {
  await db.insert(auditLog).values({
    workspaceId, actorId: event.actorId ?? null, action: event.action, target: event.target, data: event.data ?? null,
  })
}
