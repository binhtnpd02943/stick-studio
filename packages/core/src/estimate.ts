export const SECONDS_PER_WORD = 0.33
export const MIN_LINE = 1.0

export function estimateLineDuration(text: string): number {
  return Math.max(MIN_LINE, text.trim().split(/\s+/).length * SECONDS_PER_WORD)
}
