import { type StepJob, QUEUES, STEP_JOB_OPTIONS, stepJobId, stepQueue } from '@stick/core'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

export interface Queues {
  film: Queue<StepJob>
  render: Queue<StepJob>
  close(): Promise<void>
}

export interface RedisOptions {
  prefix?: string
  /** BullMQ queues and ioredis emit 'error' events; with no listener they crash the process. */
  onError?: (err: Error) => void
}

const logRedisError = (err: Error) => console.error('redis error:', err.message)

/** BullMQ needs `maxRetriesPerRequest: null` on every connection it uses. */
export const redisConnection = (url: string, onError: (err: Error) => void = logRedisError): Redis =>
  new Redis(url, { maxRetriesPerRequest: null }).on('error', onError)

export function createQueues(redisUrl: string, opts: RedisOptions = {}): Queues {
  const onError = opts.onError ?? logRedisError
  const connection = redisConnection(redisUrl, onError)
  const make = (name: string) => new Queue<StepJob>(name, { connection, prefix: opts.prefix }).on('error', onError)
  const film = make(QUEUES.film)
  const render = make(QUEUES.render)
  return {
    film,
    render,
    async close() {
      await Promise.all([film.close(), render.close()])
      await connection.quit()
    },
  }
}

/** The jobId makes enqueuing the same step of a version twice a no-op. `backoffMs` is a test seam. */
export async function enqueueStep(queues: Queues, job: StepJob, opts: { backoffMs?: number } = {}): Promise<void> {
  const backoff = { ...STEP_JOB_OPTIONS.backoff, delay: opts.backoffMs ?? STEP_JOB_OPTIONS.backoff.delay }
  await queues[stepQueue(job.step)].add(job.step, job, { ...STEP_JOB_OPTIONS, backoff, jobId: stepJobId(job.filmVersionId, job.step) })
}
