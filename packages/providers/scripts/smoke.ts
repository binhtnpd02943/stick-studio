// One paid call (< $0.01). Prints model, stop reason, usage and cost only.
import { existsSync } from 'node:fs'
import { z } from 'zod/v4'
import { ClaudeLlm, costUsd, loadConfig } from '../src/index.js'

if (existsSync('.env')) process.loadEnvFile('.env')
const cfg = loadConfig()
const llm = new ClaudeLlm({ apiKey: cfg.anthropicApiKey, model: cfg.llmModel })
const { value, usage } = await llm.generate({
  system: 'You answer with JSON only.',
  cacheSystem: false,
  messages: [{ role: 'user', content: 'Return {"ok": true}.' }],
  schema: z.object({ ok: z.boolean() }),
  effort: 'low',
  maxTokens: 2000,
})
console.log('ok', value.ok)
console.log('model', usage.model)
console.log('usage', usage)
console.log('cost_usd', costUsd(usage))
