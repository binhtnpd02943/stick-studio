import { GateFailedError, ScreenplayInvalidError, ScreenplayRejectedError, StoryRejectedError } from '@stick/pipeline'
import { CliError } from './cli-error.js'
import { gateFailureText } from './motion-gate.js'

/** Maps any failure to an exit code and its text. Provider errors print one line and never the request or env. */
export function describeFailure(e: unknown): { code: 1 | 2 | 3 | 4; text: string } {
  if (e instanceof CliError) return { code: e.exitCode, text: e.message }
  if (e instanceof ScreenplayRejectedError) {
    const lines = e.issues.map((i) => `${i.code} ${i.path} ${i.message}`)
    const missing = e.libraryRequests.length ? `\nlibrary requests: ${e.libraryRequests.join(', ')}` : ''
    return { code: 2, text: `${lines.join('\n')}${missing}\nscreenplay rejected after repair: film not rendered` }
  }
  if (e instanceof ScreenplayInvalidError) return { code: 2, text: e.issues.map((i) => `${i.code} ${i.path} ${i.message}`).join('\n') }
  if (e instanceof GateFailedError) return { code: 3, text: gateFailureText(e.findings) }
  if (e instanceof StoryRejectedError) return { code: 2, text: `${e.issues.join('\n')}\nstory rejected: film not rendered` }
  const name = e instanceof Error ? e.constructor.name : 'Error'
  return { code: 1, text: `error: ${name}: ${e instanceof Error ? e.message : String(e)}` }
}
