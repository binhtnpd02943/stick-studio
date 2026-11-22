/** Host and port only, so a log line can never carry the credentials of a connection URL. */
export function urlTarget(url: string): string {
  try {
    const { hostname, port } = new URL(url)
    return port ? `${hostname}:${port}` : hostname || '<unparseable>'
  } catch {
    return '<unparseable>'
  }
}
