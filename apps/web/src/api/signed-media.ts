import { useRef, useState } from 'react'
import { ApiError } from './client'
import { useAssetUrl } from './queries'

/**
 * The url a media element should load, plus its `onError`. A signed url can expire mid-view, so the first
 * error asks for a fresh one (a refetch, or `onExpired` when the caller owns a given `src`); a second error
 * before anything has loaded is final and exposes `error`. `onLoaded` re-arms the retry for a later expiry.
 */
export function useSignedMedia(assetId: string | null | undefined, src?: string | null, onExpired?: () => void) {
  const asset = useAssetUrl(src ? null : assetId ?? null)
  const url = src ?? asset.data?.url ?? null
  const retried = useRef(false)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const onError = () => {
    if (url === null) return
    if (retried.current) return setFailedUrl(url)
    retried.current = true
    if (src) onExpired?.()
    else void asset.refetch()
  }
  const onLoaded = () => { retried.current = false }
  const error: unknown = asset.error ?? (failedUrl !== null && failedUrl === url ? new ApiError(0, 'network', 'media failed to load') : null)
  return { url, error, onError, onLoaded }
}
