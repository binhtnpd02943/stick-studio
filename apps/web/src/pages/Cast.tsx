import { useMemo, useState } from 'react'
import { useArchiveCharacter, useCharacters, useMe } from '../api/queries'
import type { Character } from '../api/schemas'
import { CharacterForm, DEFAULT_LOOK } from '../components/CharacterForm'
import { Dialog } from '../components/Dialog'
import { ErrorNotice } from '../components/ErrorNotice'
import { vi } from '../i18n/vi'
import { ScenePreview } from '../stick/ScenePreview'
import { StickState } from '../stick/StickState'
import { castTimeline } from '../stick/timelines'

function CharacterCard({ character, canWrite, onEdit, onArchive }: { character: Character; canWrite: boolean; onEdit: () => void; onArchive: () => void }) {
  const ink = character.look?.ink ?? DEFAULT_LOOK.ink
  const hair = character.look?.hair ?? 'none'
  const timeline = useMemo(() => castTimeline({ ink, hair }), [ink, hair])
  return (
    <li className="cast-card">
      <ScenePreview timeline={timeline} trigger="hover" label={vi.cast.previewLabel(character.name)} />
      <span className="cast-card-name">{character.name}</span>
      {character.voice_id && <span className="cast-card-voice">{vi.cast.voices[character.voice_id]}</span>}
      {character.description && <p className="cast-card-description">{character.description}</p>}
      {canWrite && (
        <div className="cast-card-actions">
          <button type="button" aria-label={vi.cast.edit(character.name)} onClick={onEdit}>{vi.cast.editLabel}</button>
          <button type="button" aria-label={vi.cast.archiveFor(character.name)} onClick={onArchive}>{vi.cast.archive}</button>
        </div>
      )}
    </li>
  )
}

function ArchiveDialog({ character, onClose }: { character: Character; onClose: () => void }) {
  const archive = useArchiveCharacter()
  return (
    <Dialog title={vi.cast.archiveTitle(character.name)} onClose={onClose}>
      {archive.error && <ErrorNotice error={archive.error} />}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>{vi.cast.archiveKeep}</button>
        <button type="button" className="primary" disabled={archive.isPending} onClick={() => archive.mutate({ id: character.id }, { onSuccess: onClose })}>
          {vi.cast.archiveConfirm}
        </button>
      </div>
    </Dialog>
  )
}

type Dialogs = { kind: 'form'; character?: Character } | { kind: 'archive'; character: Character }

export function Cast() {
  const characters = useCharacters()
  const role = useMe().data?.workspace.role
  const canWrite = role === 'owner' || role === 'editor' // unknown (still loading) shows no write controls
  const [dialog, setDialog] = useState<Dialogs | null>(null)
  const close = () => setDialog(null)
  const items = characters.data ?? []
  return (
    <div className="page">
      <div className="page-head">
        <h1>{vi.cast.title}</h1>
        {canWrite && <button type="button" onClick={() => setDialog({ kind: 'form' })}>{vi.cast.add}</button>}
      </div>
      <div>
        {characters.error && <ErrorNotice error={characters.error} />}
        {characters.isPending && !characters.error && <p>{vi.loading}</p>}
        {characters.isSuccess && items.length === 0 && <StickState kind="empty" label={vi.cast.empty} />}
        <ul className="cast-grid">
          {items.map((c) => (
            <CharacterCard key={c.id} character={c} canWrite={canWrite} onEdit={() => setDialog({ kind: 'form', character: c })} onArchive={() => setDialog({ kind: 'archive', character: c })} />
          ))}
        </ul>
      </div>
      {dialog?.kind === 'form' && (
        <Dialog title={dialog.character ? vi.cast.editTitle(dialog.character.name) : vi.cast.add} onClose={close}>
          <CharacterForm character={dialog.character} onDone={close} />
        </Dialog>
      )}
      {dialog?.kind === 'archive' && <ArchiveDialog character={dialog.character} onClose={close} />}
    </div>
  )
}
