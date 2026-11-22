/** Callers fetch `limit + 1` rows ordered `id DESC`; the extra row only signals that another page exists. */
export function page<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null }
  const items = rows.slice(0, limit)
  return { items, nextCursor: items[items.length - 1]?.id ?? null }
}
