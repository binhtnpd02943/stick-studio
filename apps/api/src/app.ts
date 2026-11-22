import fastifyCookie from '@fastify/cookie'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifySwagger from '@fastify/swagger'
import { MIN_SIGNING_KEY_LENGTH } from '@stick/providers'
import Fastify, { type FastifyInstance } from 'fastify'
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import { v7 } from 'uuid'
import { authHook } from './auth.js'
import { sendError } from './envelope.js'
import { ApiError, errorHandler } from './errors.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { meRoutes } from './routes/me.js'
import { workspaceRoutes } from './routes/workspace.js'
import type { ApiDeps } from './types.js'

export type { ApiDeps } from './types.js'

export interface BuildAppOptions {
  /** Defaults to stdout. */
  logStream?: { write(line: string): void }
  /** Redis key prefix for rate-limit counters; tests give each app its own. */
  rateLimitNamespace?: string
}

export const RATE_LIMIT = { max: 120, timeWindow: '1 minute' }
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

const REDACT_PATHS = [
  'req.headers.authorization', 'req.headers.cookie', 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]',
  'headers.authorization', 'headers.cookie', 'headers["x-csrf-token"]',
  'password', '*.password', '*.*.password',
]

export async function buildApp(deps: ApiDeps, opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  // Signed asset URLs depend on it; an empty or short key would make them forgeable.
  if ((deps.cfg.urlSigningKey ?? '').length < MIN_SIGNING_KEY_LENGTH) {
    throw new Error(`STICK_URL_SIGNING_KEY must be at least ${MIN_SIGNING_KEY_LENGTH} characters`)
  }

  const app = Fastify({
    // 1. request id: a safe client x-request-id, else uuid v7.
    requestIdHeader: false,
    genReqId: (req) => {
      const sent = req.headers['x-request-id']
      return typeof sent === 'string' && SAFE_REQUEST_ID.test(sent) ? sent : v7()
    },
    // 2. redaction.
    logger: { level: 'info', redact: { paths: REDACT_PATHS, censor: '[redacted]' }, ...(opts.logStream ? { stream: opts.logStream } : {}) },
    // Behind `tailscale serve` every client arrives from loopback; trust its X-Forwarded-For so the per-IP login limit is per client.
    trustProxy: 'loopback',
  })
  app.addHook('onRequest', async (req, reply) => { reply.header('x-request-id', req.id) })

  // 3. zod type provider and OpenAPI.
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  await app.register(fastifySwagger, {
    openapi: { openapi: '3.1.0', info: { title: 'Stick Studio API', version: '0.0.0' } },
    transform: jsonSchemaTransform,
  })
  app.get('/v1/openapi.json', { config: { public: true }, schema: { hide: true } }, async () => app.swagger())

  // 4. cookie.
  await app.register(fastifyCookie)

  // 5. rate limit. A preHandler, so the principal from the auth hook keys it; a broken Redis lets requests through.
  await app.register(fastifyRateLimit, {
    ...RATE_LIMIT,
    hook: 'preHandler',
    skipOnError: true,
    redis: deps.redis,
    nameSpace: opts.rateLimitNamespace ?? 'stick-rl:',
    keyGenerator: (req) => req.principal?.tokenId ?? req.principal?.sessionId ?? req.ip,
    errorResponseBuilder: (_req, ctx) => new ApiError(429, 'rate_limited', 'rate limit exceeded', { retry_after_s: Math.ceil(ctx.ttl / 1000) }),
  })

  // 6. auth.
  app.decorateRequest('principal', null as never)
  app.addHook('onRequest', authHook(deps.db))

  // 7. routes.
  for (const routes of [healthRoutes, authRoutes, meRoutes, workspaceRoutes]) routes(app, deps)
  app.setNotFoundHandler((_req, reply) => sendError(reply, 404, 'not_found', 'not found'))

  // 8. errors.
  app.setErrorHandler(errorHandler)
  return app
}
