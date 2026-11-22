import { getUser, getWorkspace } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import { ok } from '../envelope.js'
import { unauthorized } from '../errors.js'
import type { ApiDeps } from '../types.js'

export function meRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  app.get('/v1/me', { schema: { tags: ['auth'] } }, async (req, reply) => {
    const p = req.principal
    const [user, workspace] = await Promise.all([getUser(db, p.userId), getWorkspace(db, p.workspaceId)])
    if (!user || !workspace) throw unauthorized()
    return ok(reply, {
      user: { id: user.id, email: user.email, name: user.name },
      workspace: { id: workspace.id, name: workspace.name, role: p.role },
      ...(p.via === 'session' ? { csrf_token: p.csrfToken } : {}),
    })
  })
}
