import { QUEUES, type StepJob } from '@stick/core'
import { type Job, Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { redisPublisher } from './events.js'
import { createQueues, enqueueStep, redisConnection } from './queues.js'
import { type WorkerDeps, runStepJob } from './run-step.js'

export interface StartWorkerOptions {
  redisUrl: string
  prefix?: string
  filmConcurrency?: number
  renderConcurrency?: number
  /** Test seam: overrides the retry backoff delay of the jobs this worker enqueues. */
  backoffMs?: number
}

const DEFAULT_FILM_CONCURRENCY = 2
// Rendering is CPU- and memory-heavy, so one at a time.
const DEFAULT_RENDER_CONCURRENCY = 1

export async function startWorker(
  deps: Omit<WorkerDeps, 'enqueue' | 'publish'>, opts: StartWorkerOptions,
): Promise<{ workers: Worker<StepJob>[]; close(): Promise<void> }> {
  const onError = (err: Error) => deps.log.error({ err }, 'redis error')
  const queues = createQueues(opts.redisUrl, { prefix: opts.prefix, onError })
  const publisher = redisPublisher(opts.redisUrl, onError)
  const full: WorkerDeps = {
    ...deps,
    enqueue: (job) => enqueueStep(queues, job, { backoffMs: opts.backoffMs }),
    publish: publisher.publish,
  }

  const processor = (job: Job<StepJob>) => {
    const { filmId, filmVersionId, step } = job.data
    const log = deps.log.child({ filmId, versionId: filmVersionId, step })
    const n = job.attemptsMade + 1
    // TransientStepError propagates, so BullMQ retries with the job's backoff.
    return runStepJob({ ...full, log }, job.data, { n, final: n >= (job.opts.attempts ?? 1) })
  }
  const connections = [redisConnection(opts.redisUrl, onError), redisConnection(opts.redisUrl, onError)]
  const make = (name: string, concurrency: number, connection: Redis) =>
    new Worker<StepJob>(name, processor, { connection, prefix: opts.prefix, concurrency })
      .on('error', onError)
      .on('failed', (job, err) => deps.log.warn({ jobId: job?.id, queue: name, err }, 'job attempt failed'))
  const workers = [
    make(QUEUES.film, opts.filmConcurrency ?? DEFAULT_FILM_CONCURRENCY, connections[0]!),
    make(QUEUES.render, opts.renderConcurrency ?? DEFAULT_RENDER_CONCURRENCY, connections[1]!),
  ]

  return {
    workers,
    async close() {
      // Waits for in-flight jobs, then the enqueue and publish connections they used.
      await Promise.all(workers.map((w) => w.close()))
      await Promise.all(connections.map((c) => c.quit()))
      await queues.close()
      await publisher.close()
    },
  }
}
