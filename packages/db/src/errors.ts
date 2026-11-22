export class NotFoundError extends Error {
  readonly code = 'not_found'
  constructor(message = 'not found', readonly details: unknown = {}) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor(readonly code: string, message: string, readonly details: unknown = {}) {
    super(message)
    this.name = 'ConflictError'
  }
}
