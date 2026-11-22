import { type FormEvent, useId, useState } from 'react'
import { type ChannelInput, useSaveChannel } from '../api/queries'
import type { Channel } from '../api/schemas'
import { vi } from '../i18n/vi'
import { ErrorNotice } from './ErrorNotice'

const NAME_MAX = 80
const LOCALE_MIN = 2
const LOCALE_MAX = 35
const THRESHOLD_MIN = 0
const THRESHOLD_MAX = 100
export const DEFAULT_LOCALE = 'vi-VN'

/** `pending` is the window while `me` loads: controls stay off and no "view only" claim is made yet. */
export type Access = 'write' | 'view' | 'pending'

/** `undefined` when the text is not a number in range. */
export function parseNumber(text: string, min: number, max: number): number | undefined {
  const n = text.trim() === '' ? Number.NaN : Number(text)
  return n >= min && n <= max ? n : undefined
}

/** Only the fields that differ from `channel`; with no channel, every field the API needs. */
function changes(draft: ChannelInput, channel?: Channel): Partial<ChannelInput> {
  if (!channel) return draft.auto_score_threshold === null ? { display_name: draft.display_name, locale: draft.locale, review_policy: draft.review_policy } : draft
  const out: Partial<ChannelInput> = {}
  if (draft.display_name !== channel.display_name) out.display_name = draft.display_name
  if (draft.locale !== channel.locale) out.locale = draft.locale
  if (draft.review_policy !== channel.review_policy) out.review_policy = draft.review_policy
  if (draft.auto_score_threshold !== channel.auto_score_threshold) out.auto_score_threshold = draft.auto_score_threshold
  return out
}

/** `channel` undefined creates; defined edits in place. Edits live in local state, so a refetch never overwrites what is typed. */
export function ChannelForm({ channel, access = 'write', onDone }: { channel?: Channel; access?: Access; onDone?: () => void }) {
  const id = useId()
  const save = useSaveChannel()
  const [name, setName] = useState(channel?.display_name ?? '')
  const [locale, setLocale] = useState(channel?.locale ?? DEFAULT_LOCALE)
  const [policy, setPolicy] = useState<ChannelInput['review_policy']>(channel?.review_policy ?? 'manual')
  const [threshold, setThreshold] = useState(channel?.auto_score_threshold?.toString() ?? '')
  const [submitted, setSubmitted] = useState(false)

  const auto = policy === 'auto_if_score'
  const parsedThreshold = auto ? parseNumber(threshold, THRESHOLD_MIN, THRESHOLD_MAX) : null
  const displayName = name.trim()
  const localeValue = locale.trim()
  const errors = {
    name: displayName.length === 0 ? vi.settings.channelNameRequired : displayName.length > NAME_MAX ? vi.settings.channelNameTooLong(NAME_MAX) : null,
    locale: localeValue.length < LOCALE_MIN || localeValue.length > LOCALE_MAX ? vi.settings.localeInvalid(LOCALE_MIN, LOCALE_MAX) : null,
    threshold: parsedThreshold === undefined ? vi.settings.thresholdInvalid(THRESHOLD_MIN, THRESHOLD_MAX) : null,
  }
  const show = (error: string | null) => (submitted ? error : null)
  const body = changes({ display_name: displayName, locale: localeValue, review_policy: policy, auto_score_threshold: parsedThreshold ?? null }, channel)
  const dirty = Object.keys(body).length > 0

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (errors.name || errors.locale || errors.threshold) return
    if (!dirty) return onDone?.()
    save.mutate({ id: channel?.id, ...body }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="settings-form">
      <fieldset disabled={access !== 'write'}>
        {access === 'view' && <p className="field-hint">{vi.settings.viewOnly}</p>}
        <div className="field">
          <label htmlFor={`${id}-name`}>{vi.settings.channelName}</label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!show(errors.name)} aria-describedby={`${id}-name-error`} aria-required="true" />
          <span id={`${id}-name-error`} className="field-meta">{show(errors.name)}</span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-locale`}>{vi.settings.locale}</label>
          <input id={`${id}-locale`} value={locale} onChange={(e) => setLocale(e.target.value)} aria-invalid={!!show(errors.locale)} aria-describedby={`${id}-locale-error`} aria-required="true" />
          <span id={`${id}-locale-error`} className="field-meta">{show(errors.locale)}</span>
        </div>
        <fieldset className="radio-group">
          <legend>{vi.settings.policy}</legend>
          <label><input type="radio" name={`${id}-policy`} checked={!auto} onChange={() => setPolicy('manual')} /> {vi.settings.policyManual}</label>
          <label><input type="radio" name={`${id}-policy`} checked={auto} onChange={() => setPolicy('auto_if_score')} /> {vi.settings.policyAuto}</label>
        </fieldset>
        {auto && (
          <div className="field">
            <label htmlFor={`${id}-threshold`}>{vi.settings.threshold}</label>
            <input id={`${id}-threshold`} type="number" min={THRESHOLD_MIN} max={THRESHOLD_MAX} step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-invalid={!!show(errors.threshold)} aria-describedby={`${id}-threshold-error`} aria-required="true" />
            <span id={`${id}-threshold-error`} className="field-meta">{show(errors.threshold)}</span>
          </div>
        )}
        {save.error && <ErrorNotice error={save.error} />}
        {access === 'write' && (
          <div className="settings-actions">
            <button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? vi.settings.saving : vi.settings.saveChannel}</button>
            {save.isSuccess && !dirty && channel && <span role="status">{vi.settings.saved}</span>}
          </div>
        )}
      </fieldset>
    </form>
  )
}
