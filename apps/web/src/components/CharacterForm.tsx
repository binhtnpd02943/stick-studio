import { HAIR_STYLES, VOICE_IDS } from '@stick/core'
import { type FormEvent, useMemo, useState } from 'react'
import { type CharacterInput, useSaveCharacter } from '../api/queries'
import type { Character } from '../api/schemas'
import { vi } from '../i18n/vi'
import { ScenePreview } from '../stick/ScenePreview'
import { castTimeline } from '../stick/timelines'
import { ErrorNotice } from './ErrorNotice'

const NAME_MAX = 40
const DESCRIPTION_MAX = 500
export const DEFAULT_LOOK = { ink: '#1b1b1b', hair: 'short' } as const

/** Only the fields that differ from `character`; with no character, every field. */
function changes(draft: CharacterInput, character?: Character): Partial<CharacterInput> {
  if (!character) return { ...draft, description: draft.description || undefined }
  const out: Partial<CharacterInput> = {}
  if (draft.name !== character.name) out.name = draft.name
  if (draft.look.ink !== (character.look?.ink ?? DEFAULT_LOOK.ink) || draft.look.hair !== (character.look?.hair ?? 'none')) out.look = draft.look
  if (draft.voice_id && draft.voice_id !== character.voice_id) out.voice_id = draft.voice_id
  if ((draft.description || null) !== (character.description || null)) out.description = draft.description || null
  return out
}

/** `character` undefined creates; defined edits. Mounted by a Dialog, so every opening starts from the saved values. */
export function CharacterForm({ character, onDone }: { character?: Character; onDone: () => void }) {
  const save = useSaveCharacter()
  const [name, setName] = useState(character?.name ?? '')
  const [ink, setInk] = useState(character ? (character.look?.ink ?? DEFAULT_LOOK.ink) : DEFAULT_LOOK.ink)
  const [hair, setHair] = useState(character ? (character.look?.hair ?? 'none') : DEFAULT_LOOK.hair)
  const [voice, setVoice] = useState(character ? (character.voice_id ?? '') : 'narrator')
  const [description, setDescription] = useState(character?.description ?? '')
  const [submitted, setSubmitted] = useState(false)

  const preview = useMemo(() => castTimeline({ ink, hair }), [ink, hair])
  const length = name.trim().length
  const tooLong = length > NAME_MAX
  const nameError = length === 0 ? vi.cast.nameRequired : tooLong ? vi.cast.nameTooLong(NAME_MAX) : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (nameError) return
    const body = changes({ name: name.trim(), look: { ink, hair }, voice_id: voice, description: description.trim() }, character)
    if (Object.keys(body).length === 0) return onDone()
    save.mutate({ id: character?.id, ...body }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="cast-draft">
        <ScenePreview timeline={preview} trigger="view" label={vi.cast.draftLabel} />
      </div>
      <div className="field">
        <label htmlFor="cast-name">{vi.cast.name}</label>
        <input id="cast-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={tooLong || (submitted && !!nameError)} aria-describedby="cast-name-meta" aria-required="true" />
        <span id="cast-name-meta" className="field-meta">
          <span>{(tooLong || submitted) && nameError}</span>
          <span data-error={tooLong}>{length}/{NAME_MAX}</span>
        </span>
      </div>
      <div className="field">
        <label htmlFor="cast-ink">{vi.cast.ink}</label>
        <input id="cast-ink" type="color" className="cast-ink" value={ink} onChange={(e) => setInk(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cast-hair">{vi.cast.hair}</label>
        <select id="cast-hair" value={hair} onChange={(e) => setHair(e.target.value as typeof hair)}>
          {HAIR_STYLES.map((h) => <option key={h} value={h}>{vi.cast.hairStyles[h]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cast-voice">{vi.cast.voice}</label>
        <select id="cast-voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
          {voice === '' && <option value="">{vi.cast.noVoice}</option>}
          {VOICE_IDS.map((v) => <option key={v} value={v}>{vi.cast.voices[v]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cast-description">{vi.cast.description}</label>
        <textarea id="cast-description" rows={3} maxLength={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {save.error && <ErrorNotice error={save.error} />}
      <button type="submit" className="primary" disabled={save.isPending}>{save.isPending ? vi.cast.saving : vi.cast.save}</button>
    </form>
  )
}
