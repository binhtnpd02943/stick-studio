import { type FormEvent, useState } from 'react'
import { useRedoFilm } from '../../api/queries'
import type { Film } from '../../api/schemas'
import { ErrorNotice } from '../../components/ErrorNotice'
import { vi } from '../../i18n/vi'
import { useRefetchOnConflict } from './FilmActions'

const REASON_MAX = 500
const FROM = ['story', 'screenplay', 'voice', 'render'] as const

/** "Chưa ưng?": a note and the user-word step to restart from, sent as a redo; the current version is kept. */
export function RedoBox({ film, onDone, autoFocus = false }: { film: Film; onDone?: () => void; autoFocus?: boolean }) {
  const redo = useRedoFilm()
  const onError = useRefetchOnConflict(film.id)
  const [step, setStep] = useState<string>('screenplay')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const missing = reason.trim() === ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (missing) return
    redo.mutate({ id: film.id, from_step: step, reason: reason.trim() }, { onSuccess: () => onDone?.(), onError })
  }
  return (
    <form className="redo" id="redo" aria-labelledby="redo-h" onSubmit={submit} noValidate>
      <h2 id="redo-h">{vi.detail.redoTitle}</h2>
      <textarea
        id="redo-reason" aria-label={vi.detail.redoReason} placeholder={vi.detail.redoPlaceholder} rows={3} maxLength={REASON_MAX}
        value={reason} aria-required="true" aria-invalid={submitted && missing} aria-describedby={submitted && missing ? 'redo-missing' : undefined}
        autoFocus={autoFocus} onChange={(e) => setReason(e.target.value)}
      />
      {submitted && missing && <p id="redo-missing" className="redo-missing">{vi.detail.redoReasonRequired}</p>}
      <div className="redo-row">
        <label className="redo-from">
          {vi.detail.redoFrom}
          <select value={step} onChange={(e) => setStep(e.target.value)}>
            {FROM.map((s) => <option key={s} value={s}>{vi.detail.redoFromSteps[s]}</option>)}
          </select>
        </label>
        <button type="submit" disabled={redo.isPending}>{vi.detail.redoSubmit}</button>
        <span className="redo-note">{vi.detail.redoKeeps}</span>
      </div>
      {redo.error && <ErrorNotice error={redo.error} />}
    </form>
  )
}
