import { LlmStorySchema, StorySchema, type LlmProvider, type LlmUsage, type Story } from '@stick/core'
import { storySystem, storyUser, type StoryUserInput } from '@stick/prompts'

export class StoryRejectedError extends Error {
  constructor(readonly issues: string[]) {
    super(`story rejected: ${issues.join('; ')}`)
    this.name = 'StoryRejectedError'
  }
}

// No repair loop: StorySchema is loose enough that one retry is not worth the code.
export async function writeStory(llm: LlmProvider, input: StoryUserInput): Promise<{ story: Story; usage: LlmUsage[] }> {
  const { value, usage } = await llm.generate({
    system: storySystem(),
    cacheSystem: false,
    messages: [{ role: 'user', content: storyUser(input) }],
    schema: LlmStorySchema,
    effort: 'medium',
    maxTokens: 8000,
  })
  const r = StorySchema.safeParse(value)
  if (!r.success) throw new StoryRejectedError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`))
  return { story: r.data, usage: [usage] }
}
