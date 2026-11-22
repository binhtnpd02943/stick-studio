import { type FormEvent, useState } from 'react'
import { type WorkspaceInput, useChannels, useMe, useSaveWorkspace, useWorkspace } from '../api/queries'
import type { Workspace } from '../api/schemas'
import { type Access, ChannelForm, parseNumber } from '../components/ChannelForm'
import { formatUsd } from '../components/CostBadge'
import { Dialog } from '../components/Dialog'
import { ErrorNotice } from '../components/ErrorNotice'
import { vi } from '../i18n/vi'

const NAME_MAX = 80
const CAP_MIN_USD = 0.01
const CAP_MAX_USD = 99_999

type CapKey = 'max_cost_per_film_usd' | 'max_cost_per_day_usd'
const CAPS: Array<{ key: CapKey; effective: 'effective_max_cost_per_film_usd' | 'effective_max_cost_per_day_usd'; label: string }> = [
  { key: 'max_cost_per_film_usd', effective: 'effective_max_cost_per_film_usd', label: vi.settings.capFilm },
  { key: 'max_cost_per_day_usd', effective: 'effective_max_cost_per_day_usd', label: vi.settings.capDay },
]

/** Edits live in local state: mounted once the workspace has loaded, so a failed refetch never discards them. */
function WorkspaceForm({ workspace, access }: { workspace: Workspace; access: Access }) {
  const save = useSaveWorkspace()
  const [name, setName] = useState(workspace.name)
  const [caps, setCaps] = useState<Record<CapKey, string>>({
    max_cost_per_film_usd: workspace.max_cost_per_film_usd?.toString() ?? '',
    max_cost_per_day_usd: workspace.max_cost_per_day_usd?.toString() ?? '',
  })
  const [bad, setBad] = useState<Record<CapKey, boolean>>({ max_cost_per_film_usd: false, max_cost_per_day_usd: false }) // a number input reads garbage like "1e" as ''
  const [submitted, setSubmitted] = useState(false)

  const nameValue = name.trim()
  const nameError = nameValue.length === 0 ? vi.settings.nameRequired : nameValue.length > NAME_MAX ? vi.settings.nameTooLong(NAME_MAX) : null
  // empty means "use the default" (null); a non-empty value out of range is `undefined`
  const parsed = (key: CapKey) => (bad[key] ? undefined : caps[key].trim() === '' ? null : parseNumber(caps[key], CAP_MIN_USD, CAP_MAX_USD))
  const capError = vi.settings.capInvalid(String(CAP_MIN_USD).replace('.', ','), CAP_MAX_USD)
  const invalid = !!nameError || CAPS.some(({ key }) => parsed(key) === undefined)

  const body: WorkspaceInput = {}
  if (nameValue !== workspace.name) body.name = nameValue
  for (const { key } of CAPS) {
    const value = parsed(key)
    if (value !== undefined && value !== workspace[key]) body[key] = value
  }
  const dirty = Object.keys(body).length > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (invalid || !dirty) return
    save.mutate(body)
  }

  return (
    <form onSubmit={submit} noValidate className="settings-form">
      <fieldset disabled={access !== 'write'}>
        {access === 'view' && <p className="field-hint">{vi.settings.viewOnly}</p>}
        <div className="field">
          <label htmlFor="ws-name">{vi.settings.name}</label>
          <input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={submitted && !!nameError} aria-describedby="ws-name-error" aria-required="true" />
          <span id="ws-name-error" className="field-meta">{submitted && nameError}</span>
        </div>
        {CAPS.map(({ key, effective, label }) => {
          const error = submitted && parsed(key) === undefined
          return (
            <div className="field" key={key}>
              <label htmlFor={`ws-${key}`}>{label}</label>
              <input
                id={`ws-${key}`} type="number" step="0.01" min={CAP_MIN_USD} max={CAP_MAX_USD} value={caps[key]}
                onChange={(e) => { setCaps({ ...caps, [key]: e.target.value }); setBad({ ...bad, [key]: e.currentTarget.validity.badInput }) }} aria-invalid={error} aria-describedby={`ws-${key}-meta`}
              />
              <span id={`ws-${key}-meta`} className="field-meta">
                <span>{error ? capError : workspace[key] === null ? vi.settings.capDefault(formatUsd(workspace[effective])) : vi.settings.capSet(formatUsd(workspace[key]))}</span>
              </span>
            </div>
          )
        })}
        {save.error && <ErrorNotice error={save.error} />}
        {access === 'write' && (
          <div className="settings-actions">
            <button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? vi.settings.saving : vi.settings.save}</button>
            {save.isSuccess && !dirty && <span role="status">{vi.settings.saved}</span>}
          </div>
        )}
      </fieldset>
    </form>
  )
}

export function Settings() {
  const workspace = useWorkspace()
  const channels = useChannels()
  const role = useMe().data?.workspace.role
  const access: Access = role === undefined ? 'pending' : role === 'owner' || role === 'editor' ? 'write' : 'view'
  const [adding, setAdding] = useState(false)
  return (
    <div className="page">
      <div className="page-head">
        <h1>{vi.nav.settings}</h1>
      </div>
      <section aria-labelledby="settings-workspace" className="settings-section">
        <div className="section-head"><h2 id="settings-workspace">{vi.settings.workspace}</h2></div>
        {workspace.error && <ErrorNotice error={workspace.error} />}
        {workspace.isPending && !workspace.error && <p>{vi.loading}</p>}
        {workspace.data && <WorkspaceForm workspace={workspace.data} access={access} />}
      </section>
      <section aria-labelledby="settings-channels" className="settings-section">
        <div className="section-head">
          <h2 id="settings-channels">{vi.settings.channels}</h2>
          {access === 'write' && <button type="button" onClick={() => setAdding(true)}>{vi.settings.addChannel}</button>}
        </div>
        {channels.error && <ErrorNotice error={channels.error} />}
        {channels.isPending && !channels.error && <p>{vi.loading}</p>}
        {channels.isSuccess && channels.data.length === 0 && <p>{vi.settings.noChannels}</p>}
        {channels.data?.map((c) => <ChannelForm key={c.id} channel={c} access={access} />)}
      </section>
      {adding && (
        <Dialog title={vi.settings.addChannel} onClose={() => setAdding(false)}>
          <ChannelForm onDone={() => setAdding(false)} />
        </Dialog>
      )}
    </div>
  )
}
