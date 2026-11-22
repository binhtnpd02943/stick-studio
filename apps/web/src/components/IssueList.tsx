import type { Issue } from '@stick/core'

/** A finding of unknown shape as a line of text. */
export const findingText = (finding: unknown): string => (typeof finding === 'string' ? finding : JSON.stringify(finding))

/** Strings come from a schema failure (`parseScreenplay`), objects from the validator. */
export function IssueList({ issues }: { issues: readonly (string | Issue)[] }) {
  return (
    <ul className="issue-list">
      {issues.map((issue, i) => (
        <li key={i}>
          {typeof issue === 'string' ? issue : (
            <>
              <b>{issue.code}</b> <code>{issue.path}</code> {issue.message}
              {issue.key && <> ({issue.key})</>}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
