import { z } from 'zod/v4'
import { vi } from '../../i18n/vi'

export const StoryAsset = z.object({
  title: z.string(),
  logline: z.string(),
  genre: z.string(),
  hook: z.string(),
  cast: z.array(z.object({ id: z.string(), name: z.string() })),
  scenes: z.array(z.object({ setting: z.string(), beats: z.array(z.object({ who: z.string(), line: z.string() })) })),
  content_warnings: z.array(z.string()),
})
export type Story = z.infer<typeof StoryAsset>

export function StoryView({ story }: { story: Story }) {
  const nameOf = (id: string) => story.cast.find((c) => c.id === id)?.name ?? id
  return (
    <article className="story-view">
      <h3>{story.title}</h3>
      <dl>
        <dt>{vi.screenplay.logline}</dt><dd>{story.logline}</dd>
        <dt>{vi.screenplay.genre}</dt><dd>{story.genre}</dd>
        <dt>{vi.screenplay.hook}</dt><dd>{story.hook}</dd>
      </dl>
      {story.content_warnings.length > 0 && (
        <div className="story-warnings">
          <b>{vi.screenplay.warnings}</b>
          <ul>{story.content_warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      )}
      {story.scenes.map((scene, i) => (
        <section key={i}>
          <h4>{i + 1}. {scene.setting}</h4>
          <ul>{scene.beats.map((b, j) => <li key={j}>{nameOf(b.who)}: {b.line}</li>)}</ul>
        </section>
      ))}
    </article>
  )
}
