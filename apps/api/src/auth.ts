import { type Db, type Principal, findApiToken, findSession } from '@stick/db'
import type { FastifyRequest } from 'fastify'
import { timingSafeEqual } from 'node:crypto'
import { ApiError, forbidden, unauthorized } from './errors.js'

declare module 'fastify' {
  interface FastifyRequest { principal: Principal }
  interface FastifyContextConfig {
    public?: boolean
    /** Message of this route's 500s instead of 'internal error'. */
    internalMessage?: string
  }
}

export const SESSION_COOKIE = 'sid'
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const BEARER = /^Bearer (stk_[A-Za-z0-9_-]{1,128})$/

const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function resolvePrincipal(db: Db, request: FastifyRequest): Promise<Principal | undefined> {
  const header = request.headers.authorization
  // A request that sends an Authorization header is judged by it alone, never by a cookie it also carries.
  if (header !== undefined) {
    const token = BEARER.exec(header)?.[1]
    return token ? findApiToken(db, token) : undefined
  }
  const sid = request.cookies[SESSION_COOKIE]
  return sid ? findSession(db, sid) : undefined
}

/** onRequest: sets request.principal when the credentials are valid. Rejection waits for `requireAuth`. */
export function authHook(db: Db) {
  return async (request: FastifyRequest): Promise<void> => {
    if (request.routeOptions.config.public) return
    const principal = await resolvePrincipal(db, request)
    if (principal) request.principal = principal
  }
}

/**
 * Route-level preHandler, added after the rate limiter's, so anonymous and failing requests are counted (per IP) before
 * they get 401/403. Enforces CSRF on cookie writes and read-only access for viewers.
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (request.routeOptions.config.public) return
  const principal = request.principal
  if (!principal) throw unauthorized()
  if (!WRITE_METHODS.has(request.method)) return
  if (principal.via === 'session') {
    const sent = request.headers['x-csrf-token']
    if (typeof sent !== 'string' || !principal.csrfToken || !sameToken(sent, principal.csrfToken)) {
      throw new ApiError(403, 'csrf_failed', 'missing or invalid x-csrf-token')
    }
  }
  // Viewers may still log out.
  if (principal.role === 'viewer' && !request.routeOptions.url?.startsWith('/v1/auth/')) throw forbidden()
}
