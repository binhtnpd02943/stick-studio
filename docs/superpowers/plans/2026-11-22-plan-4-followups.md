# Plan 4: rulings and deferred follow-ups

Branch plan-4-backend, commits 7aa6efd..HEAD. The backend (packages/db, apps/worker, apps/api) runs a film end to end with fake providers on PGlite and on the compose Postgres. The live Claude API path is still unverified. Operating notes are in [docs/runbook.md](../../runbook.md).

## Live-run prerequisites (unchanged from plan 3)
- `ANTHROPIC_API_KEY` must be valid. The key that plan 3 tried returned 401, and nothing in plan 4 changed that. Fake mode (`STICK_FAKE=1`) needs no key.
- Watch `path_blocked` and `mark_collision` in repair rounds, and the loudness drift on SFX-only mixes (both listed in the plan-3 follow-ups).

## Before plan 5
- API transitions publish no SSE events. Cancel, redo, approve and `PATCH .../screenplay` change the film without telling `/v1/films/:id/events` subscribers; only the worker publishes. Add a `publish` dependency to `buildApp`.
- No stale-running sweep. A worker that dies mid-step leaves the film `running` and the `step_runs` row `running` forever. Cancel + redo is today's recovery (see the runbook). Add a sweep for films and step_runs.
- Add a unique index on `assets (film_version_id, meta->>'path')` with `ON CONFLICT` in `replaceAsset`, and a compare-and-set in `finishRun` (`AND status = 'running'`). Both need a migration; today concurrent re-deliveries can leave two assets for one path or overwrite a finished run.
- `events-hub`: wrap each subscriber callback in its own try/catch. One throwing callback currently stops the others.
- Contact-sheet failure semantics differ. The worker fails the film; the `make` CLI warns and continues. Pick one.
- A redo that starts past the gate skips QA. Decide whether redo must always re-run the gate.
- Move the queue helpers (`createQueues`, `enqueueStep`, `redisPublisher`, `urlTarget`) out of apps/worker into a package. The API depends on the worker for them, which pulls in canvas.

## Rulings
Controller rulings from the plan-4 ledger, with the cost if each was wrong.
- | Scope | Ruling |
- | All | Ruling: adopt preflight.md's recommended ruling for every finding F1-F26 and F8b, each the narrowest fix consistent with the spec. Cost if wrong: rework in the affected task, caught by task review. |
- | F1 | api to worker dependency allowed, one direction only; the graph test checks it stays acyclic. Cost if wrong: the API build pulls in the worker's dependencies (canvas), see "Before plan 5". |
- | F2 | bullmq and ioredis were first ruled `^5.81.6` and `~5.11.1` so one ioredis copy is bundled. |
- | F3 | `startRun` upserts an unfinished row for the same (version, step, attempt). Cost if wrong: a stalled re-delivery hits the unique index. |
- | F4 | The worker reloads the film before enqueueing the next step. Cost if wrong: a cancel during a step could be overridden. |
- | F5 | The skip path is the success path (enqueue next or finalize). Cost if wrong: a healed re-delivery could stall the chain. |
- | F6 | Rate limit runs after auth, `skipOnError`, health exempt, readyz Redis ping has a timeout. Cost if wrong: anonymous floods or health checks mis-counted. |
- | F7 | First: no real-Postgres test. Reversed below by the Docker directive. |
- | F8 | fastify-type-provider-zod `~5.1.0` (peer zod 3.25 with `zod/v4/core`). Cost if wrong: schema type errors, caught by typecheck. |
- | F8b | core exports plain constants (voice ids, look fields); the API builds its own zod v4 schemas. Cost if wrong: duplicated enums can drift. |
- | F12 | TTS cost is 0 (say or fake); the meter lives inside the cache so cache hits book nothing. Cost if wrong: usage under-reported if a paid TTS is added. |
- | F13 | `sessions.updated_at` added. Cost if wrong: none. |
- | F14 | drizzle-kit loads the core import, otherwise the schema constants are inlined with an equality test. Cost if wrong: drift between CHECK lists and core constants (a test guards it). |
- | F15 | Slow test timeout 300 s in the server project. Cost if wrong: slow runs. |
- | F17 | `coverage:db` runs `--project unit`. Cost if wrong: coverage measured over the wrong files. |
- | F18 | zod is a runtime dependency of providers. Cost if wrong: a missing module at runtime. |
- | F19 | PGlite pinned after the db suite passed. Cost if wrong: a PGlite upgrade breaks migrations. |
- | F20 | The "cancelled" error class is dropped; the worker duck-types the film status instead. Cost if wrong: a missed cancel check. |
- | F21 | `seed.test` runs in a temp dir with an explicit `createDb({ url })`, so it never reads `.env`. Cost if wrong: a test touching real config. |
- | F22 | `/v1/auth/*` is exempt from the viewer role check, so viewers can log out. Cost if wrong: viewers cannot log out. |
- | F23 | Asset content is served with `sendFile(storageKey, storageDir)` plus an explicit mime. Cost if wrong: wrong content type or path escape (guarded by a root check). |
- | F25 | An edited screenplay is stored under a unique storage key. Cost if wrong: an edit overwrites the previous version's file. |
- | F26 | The E2E starts the worker only after the SSE snapshot, so early events are not missed. Cost if wrong: a racy test. |
- | Docker | Ruling: the Global Constraint "No Docker, no installed Postgres" is superseded by the user directive "dùng docker đi". PGlite stays the default for tests and dev; Postgres via compose is opt-in through `STICK_TEST_DATABASE_URL`, and F7 is reversed (the real-Postgres path is tested when the variable is set). Worker and API tests keep their private redis-server. Cost if wrong: small. |
- | T3 compose smoke | Controller smoke: 3 concurrent `createDb({ url })` against compose Postgres gave 14 tables and 1 migration row; the advisory lock works on the success path. |
- | F2 amended | Ruling: F2 amended to accept bullmq 6.7.1 and ioredis 6.0.0. `npm ls` shows one deduped ioredis (bullmq takes it as a peer), so the two-copies risk is absent. Cost if wrong: type errors in T7, caught by typecheck. |
- | T8-I1 | Ruling: anonymous requests are rate limited. Principal resolution stays in onRequest; the 401 throw moves to a preHandler registered after the limiter, so unauthenticated floods hit the per-IP 120/min limit. Cost if wrong: one DB lookup per anonymous request. |
- | T8-I2 | Ruling: login fails closed when Redis is down (route-level `skipOnError: false`); a limiter store error on login is a 500 `internal` with "login temporarily unavailable". Other routes keep `skipOnError: true`. Cost if wrong: login is unavailable while Redis is down or starting. |
- | F24 revised | Ruling: instead of the shortcut comment, a replay of a still-queued film with no step_runs re-enqueues step 1 (enqueue dedupes); a first-request enqueue failure is a 500. Cost: slightly more code in T10. |
- | Final fix wave | Ruling: the fix wave covers I1, I2, I3 plus cheap reliability minors M1 (record the budget-block reason), M4 (keyless create enqueue failure sets failed), M6 (cap bounds), M7 (route-walk auth test) and the runbook; the rest is below. Cost if wrong: a slightly larger fix wave. |

Per-task routing of the preflight findings: T2 F10 F11 F12 F15 F16 F18; T3 F13 F14 F17 F19 F21; T4 F3 F9; T6 F3 F4 F5 F20; T7 F2; T8 F1 F6 F8 F21 F22; T9 F8b F23; T10 F1 F24 F25; T11 F1 F7 F26.

## Fixed in the final wave
- I1 schema.test `pgliteDir` flaky under load (30 s timeout, also on the concurrent-createDb Postgres test). I3 `bookUsage` rejects non-finite or negative cost, and `checkBudget` treats a non-finite spend as over the cap. M1 a pre-step budget block now writes a failed `step_runs` row with `{scope, spentUsd, capUsd}`. M4 a keyless create whose enqueue fails sets the film `failed`. M6 workspace caps are bounded 0.01..99999. M7 a route-walk test asserts 401 and csrf 403 on every non-public route.

## Deferred minors
Everything the ledger marked "minor (deferred)" that this wave did not fix.

Task 1
- mix.ts:62 a `maxBuffer` overflow is mislabelled as a timeout. mix.ts:66 uses a literal `-10` instead of `STDERR_TAIL_LINES`. The mix.test hang case uses `sleep 30`, which orphans; use `exec sleep 30`.

Task 2
- The gate runs under `--skip-motion` (extra time; a `checkMotion` exception can no longer be bypassed). `fakeFilmResponses` uses a `../../../../examples` path. render-film `audioDurationsOrExit` rewraps ffprobe spawn errors. film-steps.test `present()` spawns `ls`. `readTimeline` is an unchecked cast (has a shortcut comment).
- `voiceReusable` calls `readdirSync(audio)`, which throws ENOENT if `audio/` was deleted by hand with no spoken beats; its predicate also prints (a side effect).

Task 3
- No `pool.on('error')` in some paths (the worker and dev wire `onError`). `verifyPassword` `.catch(() => false)` hides a corrupted hash. The lazy `dummyHash` is a timing difference on first use. `createUser` throws a plain Error on a short password. `inList` uses `sql.raw` and needs a "constants only" comment. An invalid cursor reaches Postgres as a uuid error (the API must validate). The pool is not ended on a connect failure.
- postgres.test `afterEach` runs cleanups in `Promise.all` (run sequentially). Pools leak if one of several concurrent `createDb` rejects. `init.sql` runs only on a fresh volume. `coverage:db` lines are 83.4% on the PGlite run.

Task 4 (money and races)
- `bookUsage` has no check that `filmVersionId` belongs to `filmId`, so `byFilm` could show another workspace's title. `replaceAsset` has no unique (version, path) index and `finishRun` has no CAS (both in "Before plan 5"). `startRun` throws `ConflictError` on an already succeeded attempt, so the worker calls `findSucceededRun` first. The createVersion cross-tenant test uses a bare `toThrow` (assert `NotFoundError`).
- `recentStories` drops a film that is mid redo-from-story (untested). Ordering by `assets.id DESC` ranks redone films newest.

Task 5
- Whitespace-only env values count as set (a 32-space signing key passes); trim in `unset`. The worker's `urlSigningKey` is `''`, so the T9 signer must reject an empty key (the API refuses one at startup). `Number()` accepts `0x` and `1e` forms. The numeric preprocess is duplicated. Only the first config error is reported. `storageKey` does not validate the workspace or version. No test that a failed `putFile` removes its temp file. The symlink trust assumption in `fs.ts` needs a comment; a symlink inside the root is followed.

Task 6
- A missing `gate.json` is silently dropped (`.catch(() => [])`; add a warning). The day cap can be overshot by parallel in-flight calls (add a shortcut comment in budget.ts). redis-setup: `freePort` race, ping without timeout, teardown ignores `signalCode`. `@anthropic-ai/sdk` is `^1.12.0`, not exact. The input hash omits fake/model mode. The cancel-mid-step test does not assert the return value.
- A failed `finishRun(succeeded)` re-runs the step as attempt n+1 (paid twice) and the final attempt leaves the run row `running`. A gate `qa_failed` update that fails transiently on the final attempt ends as `failed`, not `qa_failed`.

Task 7
- `setStatus` throwing on the final attempt fails the job but leaves the film `running` (stale sweep). Job dedup holds only while the job exists (`removeOnComplete`). Startup errors log only the message. SIGTERM waits unbounded for an in-flight render. The test subscriber has no error listener. The PGlite refusal in the worker has no automated test.
- `urlTarget` leaks `user:123` when the credential is unencoded and follows a digits-only password prefix. `queues.ts` uses `console.error`, not pino.

Task 8
- Re-login keeps the old session. The 500 handler logs the full drizzle error (query params may include csrf tokens or hashes). 413 and 415 use code `bad_request`. The Bearer scheme is case-sensitive. The readyz 503 body carries `data` and is undocumented. `trustProxy: 'loopback'` is an undocumented assumption (it holds behind `tailscale serve`). Schema-invalid authed requests are not rate-limit counted. Bodies are parsed before the limiter and the 401. Unknown paths with credentials do unlimited DB lookups. The login message also covers a DB outage. A smoke user was left in the compose database.
- LATENT: any app- or route-level `preHandler` or `preValidation` runs before `requireAuth`; there is a guard comment in app.ts but no test. Note the route-walk test sends schema-valid bodies for that reason: validation returns 400 before the 401.

Task 9
- assets.ts `!localPath()` assumes a falsy return, but `FsStorage` throws, giving 500 instead of 404. Archived characters are still writable and re-archivable. `exp` accepts `0x` and `1e` forms (use `/^\d{1,12}$/`). The review queue is N+1 (shortcut). `locale` is only length-checked. The usage default-range test asserts shape only. No viewer-403 test on the new routes. `getAssetForSignedUrl` is unscoped (the HMAC is checked first). A 416 response uses code `bad_request`. No GET character by id.

Task 10
- The create audit is outside the transaction, and the cancel audit is not in a transaction. SSE `raw.write` ignores backpressure. Redo does not pre-check restart inputs. Redo from `blocked_budget` returns a confusing message. `restartFromStep` is a cast. `main` and `dev` do not await `hub.ready`. A duplicate event is possible across the snapshot boundary.

Task 11
- The e2e 429 wait loop is unbounded and unlogged. `ffprobe` `spawnSync` status is unchecked and the audio stream is not asserted. Approve does not check the `reviews` row. The voice usage `> 0` assertion is loose. `afterAll` is unguarded. fastify-static warns when its root is missing (mkdir at startup). core/src functions are at about 70% coverage and api/src at about 67% lines (main, dev and serve are untested).

Carried over from plans 1 to 3: see [plan 3 follow-ups](2026-11-21-plan-3-followups.md) (loudnorm, SFX cache partial name, gate repair loop).
