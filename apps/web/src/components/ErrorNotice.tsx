import { ApiError } from '../api/client'
import { vi } from '../i18n/vi'

const { rate_limited: _rateLimited, ...MESSAGES }: Record<string, unknown> = vi.errors

function detailLines(details: unknown): string[] {
  if (!Array.isArray(details)) return []
  return details.map((d: unknown) => {
    const { path, message } = (d ?? {}) as { path?: unknown; message?: unknown }
    return [path, message].filter((x): x is string => typeof x === 'string' && x !== '').join(' ')
  }).filter(Boolean)
}

export function ErrorNotice({ error }: { error: unknown }) {
  const e = error instanceof ApiError ? error : undefined
  const code = e?.code ?? 'internal'
  const retry = (e?.details as { retry_after_s?: number } | undefined)?.retry_after_s
  const text = code === 'rate_limited' ? vi.errors.rate_limited(retry ?? 0) : String(MESSAGES[code] ?? vi.errors.internal)
  const lines = code === 'bad_request' ? detailLines(e?.details) : []
  return (
    <div role="alert" className="error-notice">
      <p>{text}</p>
      {lines.length > 0 && <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  )
}
