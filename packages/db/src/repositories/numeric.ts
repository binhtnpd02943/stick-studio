/** pg returns `numeric` as a string; repositories hand out numbers. */
export const toNumber = (v: string | null): number | null => (v === null ? null : Number(v))
export const toNumeric = (n: number | null): string | null => (n === null ? null : String(n))
