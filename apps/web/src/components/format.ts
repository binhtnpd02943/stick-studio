import { vi } from '../i18n/vi'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** "10 phút trước", "1 giờ trước", "Hôm qua", then the date. */
export function relativeTime(iso: string, now = Date.now()): string {
  const ago = now - Date.parse(iso)
  if (ago < MINUTE_MS) return vi.time.now
  if (ago < HOUR_MS) return vi.time.minutes(Math.floor(ago / MINUTE_MS))
  if (ago < DAY_MS) return vi.time.hours(Math.floor(ago / HOUR_MS))
  if (ago < 2 * DAY_MS) return vi.time.yesterday
  return new Date(iso).toLocaleDateString('vi-VN')
}

/** Seconds as m:ss. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
