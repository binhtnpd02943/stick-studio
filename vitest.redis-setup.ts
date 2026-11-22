import { spawn } from 'node:child_process'
import { connect, createServer } from 'node:net'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext { redisUrl: string }
}

const MISSING = 'redis-server not found: install Redis 7 (brew install redis) or set REDIS_SERVER_BIN'
const READY_TIMEOUT_MS = 10_000
const POLL_MS = 50

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
  })
}

function ping(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect(port, '127.0.0.1')
    sock.once('error', () => resolve(false))
    sock.once('connect', () => sock.write('PING\r\n'))
    sock.once('data', (d) => { sock.destroy(); resolve(d.toString().startsWith('+PONG')) })
  })
}

/** A private redis-server on a free port for the server project; killed on teardown. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const port = await freePort()
  const child = spawn(process.env.REDIS_SERVER_BIN || 'redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' })
  const spawnError = new Promise<never>((_, reject) =>
    child.once('error', (e: NodeJS.ErrnoException) => reject(e.code === 'ENOENT' ? new Error(MISSING) : e)))
  const ready = (async () => {
    for (const deadline = Date.now() + READY_TIMEOUT_MS; Date.now() < deadline; await new Promise((r) => setTimeout(r, POLL_MS))) {
      if (await ping(port)) return
    }
    throw new Error(`redis-server did not answer PING on port ${port} within ${READY_TIMEOUT_MS} ms`)
  })()
  try {
    await Promise.race([ready, spawnError])
  } catch (e) {
    child.kill()
    throw e
  }
  project.provide('redisUrl', `redis://127.0.0.1:${port}`)
  return async () => {
    if (child.exitCode !== null) return
    const exited = new Promise((r) => child.once('exit', r))
    child.kill()
    await exited
  }
}
