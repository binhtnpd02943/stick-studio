import { z } from 'zod/v4'
import { useAssetJson } from '../../api/queries'
import type { Film, FilmDetail } from '../../api/schemas'
import { AssetImage } from '../../components/AssetImage'
import { ErrorNotice } from '../../components/ErrorNotice'
import { vi } from '../../i18n/vi'

const QaReport = z.object({ findings: z.array(z.unknown()).optional() })
const assetOf = (assets: FilmDetail['assets'], kind: string) => assets.find((a) => a.kind === kind)?.id ?? null
const text = (finding: unknown) => (typeof finding === 'string' ? finding : JSON.stringify(finding))

/** The gate step's error carries the findings when it failed the film. */
function gateFindings(steps: FilmDetail['steps']): unknown[] | undefined {
  const gate = steps.find((s) => s.step === 'gate' && s.status === 'failed')
  const findings = (gate?.error as { details?: { findings?: unknown } } | null | undefined)?.details?.findings
  return Array.isArray(findings) ? findings : undefined
}

export function QaTab({ film, steps, assets }: { film: Film; steps: FilmDetail['steps']; assets: FilmDetail['assets'] }) {
  const failed = gateFindings(steps)
  const reportId = failed ? null : assetOf(assets, 'qa_report')
  const report = useAssetJson(reportId, QaReport)
  const contactId = assetOf(assets, 'contact_sheet')
  const findings = (failed ?? report.data?.findings ?? []).map(text)

  return (
    <div className="qa-tab">
      <p className="qa-score">{vi.qa.score}: <b>{film.qa_score ?? '—'}</b></p>
      {contactId && <AssetImage assetId={contactId} alt={vi.qa.contact} />}
      <h3>{vi.qa.findings}</h3>
      {reportId && report.error ? <ErrorNotice error={report.error} />
        : reportId && report.isPending ? <p>{vi.loading}</p>
        : findings.length === 0 ? <p>{vi.qa.none}</p>
        : <ul>{findings.map((f, i) => <li key={i}>{f}</li>)}</ul>}
    </div>
  )
}
