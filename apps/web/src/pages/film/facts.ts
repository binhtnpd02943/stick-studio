import { type Screenplay, type Timeline, parseScreenplay } from '@stick/core'
import { z } from 'zod/v4'
import { useAssetJson } from '../../api/queries'
import type { FilmDetail } from '../../api/schemas'

export const StoryAsset = z.object({
  scenes: z.array(z.object({ setting: z.string() })),
  content_warnings: z.array(z.string()).optional(),
})
export type Story = z.infer<typeof StoryAsset>
// The worker wrote it, so only the fields the page reads are checked.
const TimelineAsset = z.custom<Timeline>((v) => typeof (v as Timeline | null)?.duration === 'number' && Array.isArray((v as Timeline).scenes))

export const assetOf = (assets: FilmDetail['assets'], kind: string) => assets.find((a) => a.kind === kind)?.id ?? null

/** The gate step's error carries the findings when it failed the film. */
export function gateFindings(steps: FilmDetail['steps']): unknown[] | undefined {
  const gate = steps.find((s) => s.step === 'gate' && s.status === 'failed')
  const findings = (gate?.error as { details?: { findings?: unknown } } | null | undefined)?.details?.findings
  return Array.isArray(findings) ? findings : undefined
}

export interface FilmFacts {
  screenplay: Screenplay | null
  screenplayRaw: { data: unknown; error: unknown; isPending: boolean; hasAsset: boolean }
  timeline: Timeline | null
  story: Story | null
}

/** What the film's own assets say about it: screenplay, timeline (lengths) and story (places). */
export function useFilmFacts({ assets }: Pick<FilmDetail, 'assets'>): FilmFacts {
  const screenplayId = assetOf(assets, 'screenplay')
  const screenplay = useAssetJson(screenplayId, z.unknown())
  const timeline = useAssetJson(assetOf(assets, 'timeline'), TimelineAsset)
  const story = useAssetJson(assetOf(assets, 'story'), StoryAsset)
  const parsed = screenplay.data === undefined ? null : parseScreenplay(screenplay.data)
  return {
    screenplay: parsed?.ok ? parsed.value : null,
    screenplayRaw: { data: screenplay.data, error: screenplay.error, isPending: screenplay.isPending && screenplayId !== null, hasAsset: screenplayId !== null },
    timeline: timeline.data ?? null,
    story: story.data ?? null,
  }
}

/** Where to restart a stopped film: the step that failed, else the first one not done. */
export function retryStep({ steps }: Pick<FilmDetail, 'steps'>, order: readonly string[]): string {
  const failed = steps.find((s) => s.status === 'failed')?.step
  if (failed) return failed
  return order.find((step) => !steps.some((s) => s.step === step && (s.status === 'succeeded' || s.status === 'skipped'))) ?? order[0]!
}
