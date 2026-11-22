import { APIConnectionError, APIConnectionTimeoutError } from '@anthropic-ai/sdk'
import { GateFailedError } from '@stick/pipeline'
import { describe, expect, test } from 'vitest'
import { BudgetExceededError, classify } from '../src/errors.js'

const errno = (code: string) => Object.assign(new Error(code), { code })

describe('classify', () => {
  test.each<[string, unknown, ReturnType<typeof classify>]>([
    ['HTTP 429', { status: 429 }, 'transient'],
    ['HTTP 503', Object.assign(new Error('overloaded'), { status: 503 }), 'transient'],
    ['HTTP 400', { status: 400 }, 'logic'],
    ['ECONNRESET', errno('ECONNRESET'), 'transient'],
    ['ETIMEDOUT', errno('ETIMEDOUT'), 'transient'],
    ['EAI_AGAIN', errno('EAI_AGAIN'), 'transient'],
    ['ECONNREFUSED', errno('ECONNREFUSED'), 'transient'],
    ['ENOENT', errno('ENOENT'), 'logic'],
    ['APIConnectionError', new APIConnectionError({ message: 'down' }), 'transient'],
    ['APIConnectionTimeoutError', new APIConnectionTimeoutError(), 'transient'],
    ['BudgetExceededError', new BudgetExceededError('film', 2, 1), 'budget'],
    ['GateFailedError', new GateFailedError(['idle']), 'gate'],
    ['plain Error', new Error('boom'), 'logic'],
    ['a string', 'boom', 'logic'],
  ])('classify table: %s', (_name, e, expected) => {
    expect(classify(e)).toBe(expected)
  })
})
