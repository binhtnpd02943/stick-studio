export type IssueCode =
  | 'unknown_action'
  | 'unknown_prop'
  | 'unknown_backdrop'
  | 'unknown_cast'
  | 'unknown_target'
  | 'missing_target'
  | 'not_on_stage'
  | 'mark_collision'
  | 'duplicate_id'
  /** A contact action whose actor stands farther than REACH from the target. */
  | 'out_of_reach'
  | 'schema'
  /** Spoken lines differ from the story: wrong speaker, order, text, or an added/dropped line. */
  | 'line_mismatch'

export interface Issue {
  code: IssueCode
  path: string
  message: string
  /** Missing library key for unknown_action / unknown_prop / unknown_backdrop. */
  key?: string
}
