import type { LlmProvider, LlmUsage, TtsProvider } from '@stick/core'

/** Where paid calls are booked; `check` throws to refuse the next call (e.g. over budget). */
export interface Ledger {
  check(): void | Promise<void>
  bookLlm(u: LlmUsage): void | Promise<void>
  bookTts(chars: number, providerId: string): void | Promise<void>
}

/**
 * Checks before every call and books it as it returns or fails after returning (the repair loop's rejected drafts included).
 * A call that ends over the cap is kept, so the film still finishes.
 */
export function meteredLlm(inner: LlmProvider, ledger: Ledger): LlmProvider {
  return {
    async generate(req) {
      await ledger.check()
      try {
        const res = await inner.generate(req)
        await ledger.bookLlm(res.usage)
        return res
      } catch (e) {
        // A call that returned but failed validation was still paid for.
        const usage = (e as { usage?: LlmUsage }).usage
        if (usage) await ledger.bookLlm(usage)
        throw e
      }
    },
  }
}

export function meteredTts(inner: TtsProvider, ledger: Ledger): TtsProvider {
  return {
    id: inner.id,
    async synthesize(text, voice) {
      await ledger.check()
      const wav = await inner.synthesize(text, voice)
      await ledger.bookTts(text.length, inner.id)
      return wav
    },
  }
}
