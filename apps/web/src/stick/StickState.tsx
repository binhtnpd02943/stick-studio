import { ScenePreview } from './ScenePreview'
import { STICK_STATES } from './timelines'

/** A looping stick figure for empty, loading, error and done states; the caption carries the meaning. */
export function StickState({ kind, label }: { kind: keyof typeof STICK_STATES; label: string }) {
  const timeline = STICK_STATES[kind]
  return (
    <figure className="stick-state">
      <ScenePreview timeline={timeline} idle={timeline} trigger="view" interactive={false} />
      <figcaption>{label}</figcaption>
    </figure>
  )
}
