import { createHmac, timingSafeEqual } from 'node:crypto'
import { MIN_SIGNING_KEY_LENGTH } from '@stick/providers'

export const ASSET_URL_TTL_S = 900
const SIG_RE = /^[0-9a-f]{64}$/

function assertKey(key: string): void {
  if (key.length < MIN_SIGNING_KEY_LENGTH) throw new Error(`url signing key must be at least ${MIN_SIGNING_KEY_LENGTH} characters`)
}

/** HMAC-SHA256 of `<assetId>.<exp>` as lowercase hex. */
export function signAsset(assetId: string, exp: number, key: string): string {
  assertKey(key)
  return createHmac('sha256', key).update(`${assetId}.${exp}`).digest('hex')
}

/** The relative content URL for an asset, signed to expire `ASSET_URL_TTL_S` after `nowS` (unix seconds). */
export function signedAssetUrl(assetId: string, key: string, nowS = Math.floor(Date.now() / 1000)): { url: string; expires_at: string } {
  const exp = nowS + ASSET_URL_TTL_S
  return { url: `/v1/assets/${assetId}/content?exp=${exp}&sig=${signAsset(assetId, exp, key)}`, expires_at: new Date(exp * 1000).toISOString() }
}

/** False for an expired `exp` (unix seconds) or a malformed or wrong `sig`; the comparison is timing-safe. */
export function verifyAsset(assetId: string, exp: number, sig: string, key: string, now = Date.now()): boolean {
  assertKey(key)
  if (!Number.isSafeInteger(exp) || exp * 1000 < now || !SIG_RE.test(sig)) return false
  return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(signAsset(assetId, exp, key), 'hex'))
}
