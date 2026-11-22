import { useSyncExternalStore } from 'react'

/** Whether a media query matches now; false where matchMedia is missing. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia?.(query)
      media?.addEventListener('change', onChange)
      return () => media?.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(query).matches ?? false,
  )
}

export const PHONE_QUERY = '(max-width: 719.98px)'
