import type { z } from 'zod'

export const VOICE_IDS = ['narrator', 'female_young', 'male_young', 'female_old', 'male_old', 'child'] as const
export type VoiceId = (typeof VOICE_IDS)[number]

export interface LlmUsage { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
export interface LlmMessage { role: 'user' | 'assistant'; content: string }
export interface LlmRequest<T> {
  system: string
  cacheSystem: boolean
  messages: LlmMessage[]
  schema: z.ZodType<T>
  effort: 'low' | 'medium' | 'high'
  maxTokens: number
}
export interface LlmProvider { generate<T>(req: LlmRequest<T>): Promise<{ value: T; usage: LlmUsage }> }
/** `synthesize` returns WAV bytes. */
export interface TtsProvider { readonly id: string; synthesize(text: string, voice: VoiceId): Promise<Buffer> }

export class LlmRefusalError extends Error { override name = 'LlmRefusalError' }
export class LlmTruncatedError extends Error { override name = 'LlmTruncatedError' }
export class LlmSchemaError extends Error { override name = 'LlmSchemaError' }
