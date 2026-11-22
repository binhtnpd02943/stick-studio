import type { Issue } from '@stick/core'

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
