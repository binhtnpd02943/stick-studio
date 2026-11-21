import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { LlmRefusalError, LlmSchemaError, LlmTruncatedError, type LlmProvider, type LlmRequest, type LlmUsage } from '@stick/core'

const MAX_RETRIES = 3 // SDK backoff for 429/5xx/network; no retry loop of our own around paid calls

export class ClaudeLlm implements LlmProvider {
  private readonly client: Anthropic
  private readonly model: string

  constructor(opts: { apiKey: string; model: string; client?: Anthropic }) {
    this.model = opts.model
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: MAX_RETRIES })
  }

  async generate<T>(req: LlmRequest<T>): Promise<{ value: T; usage: LlmUsage }> {
    // create(), not parse(): parse() throws a generic AnthropicError on truncated JSON before stop_reason can be read.
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens,
      system: [{ type: 'text', text: req.system, ...(req.cacheSystem && { cache_control: { type: 'ephemeral' as const } }) }],
      messages: req.messages,
      output_config: { effort: req.effort, format: zodOutputFormat(req.schema) },
    })
    const u = res.usage
    const usage: LlmUsage = {
      model: this.model, // priced by the configured id, which the CLI validated at startup
      servedModel: res.model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    }
    if (res.stop_reason === 'refusal') throw new LlmRefusalError('model refused the request', usage)
    if (res.stop_reason === 'max_tokens') throw new LlmTruncatedError(`output hit max_tokens (${req.maxTokens})`, usage)
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') throw new LlmSchemaError('response has no text block', usage)
    let json: unknown
    try { json = JSON.parse(text.text) } catch { throw new LlmSchemaError('response is not valid JSON', usage) }
    const parsed = req.schema.safeParse(json)
    if (!parsed.success) throw new LlmSchemaError(parsed.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`).join('; '), usage)
    return { value: parsed.data, usage }
  }
}
