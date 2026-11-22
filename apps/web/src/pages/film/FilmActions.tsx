import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useCancelFilm } from '../../api/queries'
import { Dialog } from '../../components/Dialog'
import { ErrorNotice } from '../../components/ErrorNotice'
import { vi } from '../../i18n/vi'

/** A 409 means the film moved under us: show the notice (the caller does) and pull the fresh state. */
export function useRefetchOnConflict(filmId: string) {
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

/** The quiet "Huỷ" of a film still being made, with its confirm dialog. */
export function CancelButton({ filmId }: { filmId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>{vi.detail.cancel}</button>
      {open && <CancelDialog filmId={filmId} onClose={() => setOpen(false)} />}
    </>
  )
}
