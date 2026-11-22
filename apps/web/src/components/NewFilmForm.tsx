import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { useChannels, useCreateFilm } from '../api/queries'
import { vi } from '../i18n/vi'
import { Dialog } from './Dialog'
import { ErrorNotice } from './ErrorNotice'

const TITLE_MAX = 80
const BRIEF_MAX = 2000

/** One Idempotency-Key per mounted form: a retry after a network error repeats it, so the film is created once. */
export function NewFilmForm() {
  const navigate = useNavigate()
  const channels = useChannels().data ?? []
  const create = useCreateFilm()
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [picked, setPicked] = useState('')
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const channelId = picked || (channels.length === 1 ? channels[0]!.id : '')
  const length = title.trim().length
  const tooLong = length > TITLE_MAX
  const titleError = length === 0 ? vi.newFilm.nameRequired : tooLong ? vi.newFilm.nameTooLong(TITLE_MAX) : null
  const channelError = channelId ? null : vi.newFilm.channelRequired

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (titleError || channelError) return
    create.mutate(
      { channel_id: channelId, title: title.trim(), brief: brief.trim() || undefined, idempotencyKey },
      { onSuccess: (film) => void navigate(`/films/${film.id}`) },
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="film-channel">{vi.newFilm.channel}</label>
        <select id="film-channel" value={channelId} onChange={(e) => setPicked(e.target.value)} aria-invalid={submitted && !!channelError} aria-describedby="film-channel-error">
          {channels.length !== 1 && <option value="">{vi.newFilm.channelPlaceholder}</option>}
          {channels.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
        </select>
        <span id="film-channel-error" className="field-meta">{submitted && channelError}</span>
      </div>
      <div className="field">
        <label htmlFor="film-title">{vi.newFilm.name}</label>
        <input id="film-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={tooLong || (submitted && !!titleError)} aria-describedby="film-title-meta" aria-required="true" />
        <span id="film-title-meta" className="field-meta">
          <span>{(tooLong || submitted) && titleError}</span>
          <span data-error={tooLong}>{length}/{TITLE_MAX}</span>
        </span>
      </div>
      <div className="field">
        <label htmlFor="film-brief">{vi.newFilm.brief}</label>
        <textarea id="film-brief" rows={3} maxLength={BRIEF_MAX} value={brief} onChange={(e) => setBrief(e.target.value)} />
      </div>
      {create.error && <ErrorNotice error={create.error} />}
      <button type="submit" className="primary" disabled={create.isPending}>{create.isPending ? vi.newFilm.submitting : vi.newFilm.submit}</button>
    </form>
  )
}

/** The "Phim mới" button and its dialog; the form is mounted only while the dialog is open. */
export function NewFilmButton({ primary = false }: { primary?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={primary ? 'primary' : undefined} onClick={() => setOpen(true)}>{vi.newFilm.open}</button>
      {open && (
        <Dialog title={vi.newFilm.title} onClose={() => setOpen(false)}>
          <NewFilmForm />
        </Dialog>
      )}
    </>
  )
}
