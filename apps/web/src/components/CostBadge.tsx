import { vi } from '../i18n/vi'

const WARN_AT = 0.8
const FINE_BELOW_USD = 0.01

/** Two decimals, four for sub-cent amounts so a tiny spend does not read as free. */
export const formatUsd = (usd: number) => `$${usd > 0 && usd < FINE_BELOW_USD ? usd.toFixed(4) : usd.toFixed(2)}`

export function CostBadge({ spentUsd, capUsd, label }: { spentUsd: number; capUsd: number; label: string }) {
  const state = spentUsd >= capUsd ? 'over' : spentUsd >= WARN_AT * capUsd ? 'warn' : 'ok'
  const pct = capUsd > 0 ? Math.min(spentUsd / capUsd, 1) * 100 : 100
  return (
    <div className="cost-badge" data-state={state}>
      <span className="cost-text">{formatUsd(spentUsd)} / {formatUsd(capUsd)}</span>
      <span className="cost-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={capUsd} aria-valuenow={spentUsd} data-state={state}>
        <span className="cost-fill" style={{ width: `${pct}%` }} />
      </span>
      {state === 'over' && <span className="cost-over">{vi.film.capReached}</span>}
    </div>
  )
}
