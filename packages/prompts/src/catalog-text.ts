import type { Catalog } from '@stick/library'

const byId = <T extends { id: string }>(r: Record<string, T>) => Object.values(r).sort((a, b) => a.id.localeCompare(b.id))

/** One line per entry: actions, then props, then backdrops, each sorted by id. */
export function catalogText(catalog: Catalog): string {
  return [
    ...byId(catalog.actions).map((a) => `- ${a.id}${a.needsTarget ? ' (cần target)' : ''}${a.contact ? ' (chạm)' : ''} — ${a.description}`),
    ...byId(catalog.props).map((p) => `- ${p.id} (rộng ${p.width}) — ${p.description}`),
    ...byId(catalog.backdrops).map((b) => `- ${b.id} — ${b.description}`),
  ].join('\n')
}
