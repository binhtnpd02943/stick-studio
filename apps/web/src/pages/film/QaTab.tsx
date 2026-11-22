import { z } from 'zod/v4'
import { useAssetJson } from '../../api/queries'
import type { Film, FilmDetail } from '../../api/schemas'
import { AssetImage } from '../../components/AssetImage'
import { ErrorNotice } from '../../components/ErrorNotice'
import { findingText } from '../../components/IssueList'
import { vi } from '../../i18n/vi'
import { assetOf, gateFindings } from './facts'

const QaReport = z.object({ findings: z.array(z.unknown()).optional() })

export function QaTab({ film, steps, assets }: { film: Film; steps: FilmDetail['steps']; assets: FilmDetail['assets'] }) {
  const failed = gateFindings(steps)
  const reportId = failed ? null : assetOf(assets, 'qa_report')
  const report = useAssetJson(reportId, QaReport)
  const contactId = assetOf(assets, 'contact_sheet')
  const findings = (failed ?? report.data?.findings ?? []).map(findingText)

  return (
    <div className="qa-tab">
      <p>{vi.qa.score}: <b className="num">{film.qa_score ?? '—'}</b></p>
      <h3>{vi.qa.findings}</h3>
      {reportId && report.error ? <ErrorNotice error={report.error} />
        : reportId && report.isPending ? <p className="muted">{vi.loading}</p>
        : findings.length === 0 ? <p className="muted">{vi.qa.none}</p>
        : <ul className="qa-list">{findings.map((f, i) => <li key={i}>{f}</li>)}</ul>}
      {contactId && <AssetImage assetId={contactId} alt={vi.qa.contact} />}
    </div>
  )
}
