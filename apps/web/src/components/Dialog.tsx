import { type ReactNode, useEffect, useId, useRef } from 'react'
import { vi } from '../i18n/vi'

/** A modal `<dialog>` that opens when it mounts, so a parent shows it with `{open && <Dialog …/>}` and every opening starts with fresh form state. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose}>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label={vi.close} onClick={() => ref.current?.close()}>×</button>
      </div>
      {children}
    </dialog>
  )
}
