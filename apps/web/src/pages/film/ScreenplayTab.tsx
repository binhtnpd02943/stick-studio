import { type Issue, REDOABLE_STATUSES, type Screenplay, parseScreenplay } from '@stick/core'
import { Fragment, useState } from 'react'
import { ApiError } from '../../api/client'
import { useEditScreenplay } from '../../api/queries'
import type { Film } from '../../api/schemas'
import { ErrorNotice } from '../../components/ErrorNotice'
import { formatDuration } from '../../components/format'
import { IssueList } from '../../components/IssueList'
import { vi } from '../../i18n/vi'
import type { FilmFacts } from './facts'

const LINE_MAX = 160
const pretty = (value: unknown) => JSON.stringify(value, null, 2)
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The server's 422 is the one error with its own display: every issue, not a generic notice. */
function SaveError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.code !== 'invalid_screenplay') return <ErrorNotice error={error} />
  const issues = (error.details as { issues?: unknown } | undefined)?.issues
  return (
    <div role="alert" className="error-notice">
      <p>{vi.screenplay.issuesTitle}</p>
      <IssueList issues={Array.isArray(issues) ? (issues as (string | Issue)[]) : []} />
    </div>
  )
}

function ScreenplayEditor({ initial, saving, error, onSave, onDiscard }: {
  initial: unknown
  saving: boolean
  error: unknown
  onSave: (screenplay: unknown) => void
  onDiscard: () => void
}) {
  const parsed = parseScreenplay(initial)
  const [draft, setDraft] = useState<Screenplay | null>(parsed.ok ? parsed.value : null)
  const [text, setText] = useState(() => pretty(initial))
  const [json, setJson] = useState(!parsed.ok) // a screenplay the schema rejects can only be fixed as JSON
  const [jsonError, setJsonError] = useState<string | null>(null)

  const setLine = (si: number, bi: number, value: string) =>
    setDraft((d) => d && {
      ...d,
      scenes: d.scenes.map((s, i) => i !== si ? s : {
        ...s,
        beats: s.beats.map((b, j) => j !== bi || !b.say ? b : { ...b, say: { ...b.say, text: value } }),
      }),
    })

  const toJson = () => {
    setText(pretty(draft))
    setJson(true)
  }
  const toLines = () => {
    try {
      const next = parseScreenplay(JSON.parse(text))
      if (!next.ok) return setJsonError(next.issues.join('; '))
      setDraft(next.value)
      setJsonError(null)
      setJson(false)
    } catch (e) {
      setJsonError(vi.screenplay.invalidJson(message(e)))
    }
  }
  const save = () => {
    if (!json) return onSave(draft)
    try {
      onSave(JSON.parse(text))
      setJsonError(null)
    } catch (e) {
      setJsonError(vi.screenplay.invalidJson(message(e)))
    }
  }

  return (
    <div className="screenplay-editor">
      {json ? (
        <div className="field">
          <label htmlFor="sp-json">{vi.screenplay.jsonLabel}</label>
          <textarea id="sp-json" className="mono" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : draft?.scenes.map((scene, si) => (
        <Fragment key={si}>
          {scene.beats.map((beat, bi) => beat.say && (
            <div className="field" key={bi}>
              <label htmlFor={`sp-${si}-${bi}`}>{vi.screenplay.line(si + 1, draft.cast.find((c) => c.id === beat.say!.who)?.name ?? beat.say.who)}</label>
              <textarea id={`sp-${si}-${bi}`} rows={2} maxLength={LINE_MAX} value={beat.say.text} onChange={(e) => setLine(si, bi, e.target.value)} />
            </div>
          ))}
        </Fragment>
      ))}
      {jsonError && <div role="alert" className="error-notice"><p>{jsonError}</p></div>}
      {error != null && <SaveError error={error} />}
      <div className="editor-actions">
        <button type="button" className="primary" disabled={saving} onClick={save}>{saving ? vi.screenplay.saving : vi.screenplay.save}</button>
        {/* No draft means the schema rejected it: JSON is the only way to fix it, and there is nothing to convert from. */}
        {draft && <button type="button" onClick={json ? toLines : toJson}>{json ? vi.screenplay.editLines : vi.screenplay.editJson}</button>}
        <button type="button" onClick={onDiscard}>{vi.screenplay.discard}</button>
      </div>
    </div>
  )
}

function SceneCards({ facts }: { facts: FilmFacts }) {
  const { screenplay, timeline, story } = facts
  if (!screenplay) return null
  const inkOf = (id: string) => screenplay.cast.find((c) => c.id === id)?.look?.ink ?? 'var(--ink)'
  const nameOf = (id: string) => screenplay.cast.find((c) => c.id === id)?.name ?? id
  return (
    <div className="scene-grid">
      {screenplay.scenes.map((scene, i) => {
        const timed = timeline?.scenes[i]
        const place = story?.scenes[i]?.setting
        return (
          <article key={scene.id} className="scene-card">
            <div className="scene-head">
              <h3>{vi.screenplay.scene(i + 1)}</h3>
              {timed && <span className="num">{formatDuration(timed.end - timed.start)}</span>}
            </div>
            {place && <p className="scene-place">{place}</p>}
            {scene.beats.map((beat, j) => beat.say && (
              <p key={j} className="scene-line">
                <span className="scene-who"><i aria-hidden="true" style={{ background: inkOf(beat.say.who) }} />{nameOf(beat.say.who)}</span>
                <span>{beat.say.text}</span>
              </p>
            ))}
          </article>
        )
      })}
    </div>
  )
}

export function ScreenplayTab({ film, facts }: { film: Film; facts: FilmFacts }) {
  /** The screenplay as it was when editing began: later refetches never replace an open editor. */
  const [editing, setEditing] = useState<{ initial: unknown } | null>(null)
  const edit = useEditScreenplay()
  const raw = facts.screenplayRaw
  const redoable = (REDOABLE_STATUSES as readonly string[]).includes(film.status)
  const warnings = facts.story?.content_warnings ?? []

  const startEdit = () => {
    edit.reset()
    setEditing({ initial: raw.data })
  }
  const save = (body: unknown) => edit.mutate({ id: film.id, screenplay: body }, { onSuccess: () => setEditing(null) })

  if (editing) {
    return <ScreenplayEditor initial={editing.initial} saving={edit.isPending} error={edit.error} onSave={save} onDiscard={() => setEditing(null)} />
  }
  return (
    <div className="screenplay-tab">
      <div className="tab-toolbar">
        <button type="button" disabled={!redoable || raw.data === undefined} aria-describedby={redoable ? undefined : 'sp-hint'} onClick={startEdit}>{vi.screenplay.edit}</button>
        {!redoable && <span id="sp-hint" className="note">{vi.screenplay.disabledHint}</span>}
      </div>
      {edit.isSuccess && <p role="status">{vi.screenplay.saved}</p>}
      {raw.error != null && <ErrorNotice error={raw.error} />}
      {!raw.hasAsset ? <p className="muted">{vi.screenplay.missing}</p> : raw.isPending ? <p className="muted">{vi.loading}</p> : <SceneCards facts={facts} />}
      {warnings.length > 0 && (
        <div className="story-warnings">
          <b>{vi.screenplay.warnings}</b>
          <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
    </div>
  )
}
