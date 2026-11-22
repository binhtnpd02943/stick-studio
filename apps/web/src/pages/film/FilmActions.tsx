import { FILM_STEPS, REDOABLE_STATUSES } from '@stick/core'
import { useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { ApiError } from '../../api/client'
import { useCancelFilm, useRedoFilm } from '../../api/queries'
import type { Film } from '../../api/schemas'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/ErrorNotice'
import { vi } from '../../i18n/vi'

const REASON_MAX = 500
const isRedoable = (status: Film['status']) => (REDOABLE_STATUSES as readonly string[]).includes(status)

/** A 409 means the film moved under us: show the notice (the caller does) and pull the fresh state. */
function useRefetchOnConflict(filmId: string) {
  const qc = useQueryClient()
  return (error: unknown) => {
    if (error instanceof ApiError && error.code === 'conflict') void qc.invalidateQueries({ queryKey: ['film', filmId] })
  }
}

function CancelDialog({ filmId, onClose }: { filmId: string; onClose: () => void }) {
  const cancel = useCancelFilm()
  const onError = useRefetchOnConflict(filmId)
  return (
    <Dialog title={vi.detail.cancelTitle} onClose={onClose}>
      {cancel.error && <ErrorNotice error={cancel.error} />}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>{vi.detail.cancelKeep}</button>
        <button type="button" className="primary" disabled={cancel.isPending} onClick={() => cancel.mutate({ id: filmId }, { onSuccess: onClose, onError })}>
          {vi.detail.cancelConfirm}
        </button>
      </div>
    </Dialog>
  )
}

function RedoDialog({ filmId, onClose }: { filmId: string; onClose: () => void }) {
  const redo = useRedoFilm()
  const onError = useRefetchOnConflict(filmId)
  const [step, setStep] = useState<string>('story')
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const missing = reason.trim() === ''

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (missing) return
    redo.mutate({ id: filmId, from_step: step, reason: reason.trim() }, { onSuccess: onClose, onError })
  }
  return (
    <Dialog title={vi.detail.redoTitle} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="redo-step">{vi.detail.redoFrom}</label>
          <select id="redo-step" value={step} onChange={(e) => setStep(e.target.value)}>
            {FILM_STEPS.map((s) => <option key={s} value={s}>{vi.steps[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="redo-reason">{vi.detail.redoReason}</label>
          <textarea id="redo-reason" rows={3} maxLength={REASON_MAX} value={reason} aria-required="true" aria-invalid={submitted && missing} onChange={(e) => setReason(e.target.value)} />
          <span className="field-meta"><span>{submitted && missing && vi.detail.redoReasonRequired}</span><span>{reason.length}/{REASON_MAX}</span></span>
        </div>
        {redo.error && <ErrorNotice error={redo.error} />}
        <button type="submit" className="primary" disabled={redo.isPending}>{vi.detail.redoSubmit}</button>
      </form>
    </Dialog>
  )
}

export function FilmActions({ film }: { film: Film }) {
  const [dialog, setDialog] = useState<'cancel' | 'redo' | null>(null)
  const close = () => setDialog(null)
  const cancellable = film.status === 'queued' || film.status === 'running'
  return (
    <div className="film-actions">
      {cancellable && <button type="button" onClick={() => setDialog('cancel')}>{vi.detail.cancel}</button>}
      {isRedoable(film.status) && <button type="button" onClick={() => setDialog('redo')}>{vi.detail.redo}</button>}
      {dialog === 'cancel' && <CancelDialog filmId={film.id} onClose={close} />}
      {dialog === 'redo' && <RedoDialog filmId={film.id} onClose={close} />}
    </div>
  )
}
