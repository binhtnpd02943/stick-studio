import { LlmSchemaError, type LlmProvider, type LlmRequest, type LlmUsage } from '@stick/core'

const ZERO_USAGE: LlmUsage = { model: 'fake', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

export class FakeLlm implements LlmProvider {
  readonly requests: LlmRequest<unknown>[] = []
  private next = 0
  constructor(private readonly responses: unknown[]) {}

  async generate<T>(req: LlmRequest<T>): Promise<{ value: T; usage: LlmUsage }> {
    this.requests.push(req as LlmRequest<unknown>)
    if (this.next >= this.responses.length) throw new Error(`FakeLlm exhausted after ${this.responses.length} responses`)
    const r = req.schema.safeParse(this.responses[this.next++])
    if (!r.success) throw new LlmSchemaError(r.error.message)
    return { value: r.data, usage: ZERO_USAGE }
  }
}
