import { useSignedMedia } from '../api/signed-media'
import { ErrorNotice } from './ErrorNotice'

export function AssetImage({ assetId, alt }: { assetId: string; alt: string }) {
  const { url, error, onError, onLoaded } = useSignedMedia(assetId)
  if (error) return <ErrorNotice error={error} />
  return url ? <img className="asset-image" src={url} alt={alt} onError={onError} onLoad={onLoaded} /> : <div className="asset-image" aria-hidden="true" />
}
