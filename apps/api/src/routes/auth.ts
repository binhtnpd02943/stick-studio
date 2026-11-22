import { SESSION_TTL_SEC, createSession, deleteSession, primaryMembership, verifyPassword } from '@stick/db'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod/v4'
import { SESSION_COOKIE } from '../auth.js'
import { ok } from '../envelope.js'
import { unauthorized } from '../errors.js'
import type { ApiDeps } from '../types.js'

export const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }
// Bounded so a huge password cannot make argon2 hash megabytes.
const LoginBody = z.strictObject({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) })

const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const

export function authRoutes(app: FastifyInstance, { db }: ApiDeps): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post('/v1/auth/login', {
    schema: { body: LoginBody, tags: ['auth'] },
    config: { public: true, rateLimit: { ...LOGIN_RATE_LIMIT, keyGenerator: (req) => req.ip } },
  }, async (req, reply) => {
    const user = await verifyPassword(db, req.body.email, req.body.password)
    const membership = user && await primaryMembership(db, user.id)
    // One message for every failure, so a caller cannot tell which emails exist.
    if (!user || !membership) throw unauthorized('invalid email or password')
    const session = await createSession(db, { userId: user.id, workspaceId: membership.workspaceId })
    reply.setCookie(SESSION_COOKIE, session.token, { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_SEC })
    return ok(reply, { csrf_token: session.csrfToken })
  })

  r.post('/v1/auth/logout', { schema: { tags: ['auth'] } }, async (req, reply) => {
    const sid = req.cookies[SESSION_COOKIE]
    if (req.principal.via === 'session' && sid) await deleteSession(db, sid)
    reply.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS)
    return ok(reply, null)
  })
}
