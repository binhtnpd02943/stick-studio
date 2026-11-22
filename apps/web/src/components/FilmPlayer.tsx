import { useState } from 'react'
import { useSignedMedia } from '../api/signed-media'
import { vi } from '../i18n/vi'
import { StickState } from '../stick/StickState'
import { useReducedMotion } from '../stick/use-reduced-motion'
import { ErrorNotice } from './ErrorNotice'

interface FilmPlayerProps {
  assetId?: string | null
  /** An already-signed url; the owner supplies a fresh one when `onExpired` fires. */
  src?: string | null
  onExpired?: () => void
  autoPlay?: boolean
}

export function FilmPlayer({ assetId, src, onExpired, autoPlay = false }: FilmPlayerProps) {
  const { url, error, onError, onLoaded } = useSignedMedia(assetId, src, onExpired)
  const reduced = useReducedMotion()
  const [muted, setMuted] = useState(true)
  const auto = autoPlay && !reduced

  if (error) return <ErrorNotice error={error} />
  if (!url) return <StickState kind="rendering" label={vi.film.rendering} />
  return (
    <div className="film-player">
      <video
        className="film-video"
        src={url}
        controls
        playsInline
        preload="metadata"
        onError={onError}
        onLoadedData={onLoaded}
        {...(auto ? { autoPlay: true, loop: true, muted } : {})}
      />
      {auto && muted && <button type="button" onClick={() => setMuted(false)}>{vi.film.unmute}</button>}
    </div>
  )
}
