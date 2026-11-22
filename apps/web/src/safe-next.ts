/**
 * The post-login destination from `?next=`: a location on this origin or `/`.
 * The URL parser applies the browser's own rules (tabs, newlines, backslashes, dot segments).
 */
export function safeNext(next: string | null): string {
  if (!next) return '/'
  try {
    const url = new URL(next, window.location.origin)
    // `/.//host` normalises to the pathname `//host`, which history would treat as another origin.
    if (url.origin !== window.location.origin || url.pathname.startsWith('//')) return '/'
    return url.pathname + url.search + url.hash
  } catch {
    return '/'
  }
}
