import type { FastifyReply } from 'fastify'

export function ok(reply: FastifyReply, data: unknown, meta: Record<string, unknown> = {}): FastifyReply {
  return reply.send({ data, error: null, meta: { request_id: reply.request.id, ...meta } })
}

export function okList(reply: FastifyReply, list: { items: unknown[]; nextCursor: string | null }): FastifyReply {
  return ok(reply, list.items, { next_cursor: list.nextCursor })
}

export function sendError(reply: FastifyReply, status: number, code: string, message: string, details: unknown = {}): FastifyReply {
  return reply.status(status).send({ data: null, error: { code, message, details }, meta: { request_id: reply.request.id } })
}
