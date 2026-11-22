import { ConflictError, NotFoundError } from '@stick/db'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { sendError } from './envelope.js'

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

export const unauthorized = (message = 'authentication required') => new ApiError(401, 'unauthorized', message)
export const forbidden = (message = 'forbidden') => new ApiError(403, 'forbidden', message)
export const notFound = (message = 'not found') => new ApiError(404, 'not_found', message)
export const conflict = (code = 'conflict', details?: unknown) => new ApiError(409, code, 'conflict', details)

export function errorHandler(err: FastifyError, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (err instanceof ApiError) return sendError(reply, err.status, err.code, err.message, err.details)
  if (hasZodFastifySchemaValidationErrors(err)) {
    return sendError(reply, 400, 'bad_request', 'invalid request', err.validation.map((v) => ({ code: v.keyword, path: v.instancePath, message: v.message, ...v.params })))
  }
  if (err instanceof NotFoundError) return sendError(reply, 404, 'not_found', err.message)
  if (err instanceof ConflictError) return sendError(reply, 409, err.code, err.message, err.details)
  // Fastify's own client errors (bad JSON, wrong content type, body too large) carry safe, fixed messages.
  if (err.code?.startsWith('FST_') && err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return sendError(reply, err.statusCode, 'bad_request', err.message)
  }
  request.log.error({ err }, 'unhandled error')
  return sendError(reply, 500, 'internal', 'internal error')
}
