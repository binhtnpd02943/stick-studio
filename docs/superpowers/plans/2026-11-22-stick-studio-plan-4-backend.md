# Stick Studio Plan 4 — Backend: DB, worker, API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `npm run make` pipeline into the spec's P1 backend. A Postgres-backed API takes a film request. Stateless BullMQ workers run each pipeline step as an idempotent job, with step_runs, assets in storage, retries, cancellation and a cost ledger with caps. The film then lands in a review queue, where the owner approves it or asks for a redo. The web UI comes in plan 5.

**Architecture:**
- The step logic exists once. `@stick/pipeline` gains `runFilmStep(step, env, input)`, which works on a local work dir with fixed file names (`story.json`, `screenplay.json`, `audio/`, `timeline.json`, `gate.json`, `film.mp4`, `contact.png`). The CLI calls it on its run dir and keeps its own reuse rules and run.json. The worker calls it on a temp dir: it first downloads the step's inputs from storage, then uploads the outputs and records them in `assets`.
- `packages/db` is a Drizzle Postgres schema. It runs on PGlite by default and on node-postgres when `DATABASE_URL` is set, with the same migrations. Every business query goes through workspace-scoped repository functions.
- `apps/worker` consumes two BullMQ queues, `film` and `render`. `apps/api` is Fastify + zod, with OpenAPI, the `{data,error,meta}` envelope, session-cookie and bearer-token auth, signed asset URLs and SSE over Redis pub/sub.

**Tech Stack:** Node 24 ESM, TypeScript, npm workspaces, zod `~3.25.76` (`zod/v4`), drizzle-orm + drizzle-kit, @electric-sql/pglite, pg, bullmq + ioredis, redis-server 7.2, fastify 5 with @fastify/cookie, @fastify/rate-limit, @fastify/swagger and @fastify/static, fastify-type-provider-zod, @node-rs/argon2, uuid (v7), pino, vitest with @vitest/coverage-v8, ffmpeg.

**Spec:** `docs/superpowers/specs/2026-11-21-stick-studio-design.md`. The sections that bind this plan:
- §5: architecture, principles (idempotent stateless steps, a separate `render` queue, adapters)
- §6: pipeline steps 1–4 and 6–9, and "Kiểm soát lỗi và chi phí" (retry ×3 with exponential backoff, `usage_events`, `max_cost_per_film`/`max_cost_per_day` → `blocked_budget`, cancel checked before every step)
- §8: DB schema and indexes
- §9: API, the P1 subset
- §12: security
- §13: tests (80% coverage on core, pipeline and db)

Follow-ups: `docs/superpowers/plans/2026-11-21-plan-{1,2,3}-followups.md`. Task 1 closes the two plan-3 "Before plan 4" items.

## Global Constraints

- **Runtime and workspaces.** Node 24 ESM and npm workspaces, as in plans 1–3. The spec's pnpm and Node 22 were superseded in plan 1. Root `workspaces` becomes `["packages/*", "apps/*"]`. `tsconfig.base.json` `include` adds `apps/*/src` and `apps/*/test`.
- **Package graph.**
  - `apps/*` may depend on `packages/*`. No package depends on an app, and apps do not import each other.
  - `@stick/pipeline` may now depend on `@stick/render`. That is allowed because render only dev-depends on pipeline.
  - The graph test (`packages/core/test/graph.test.ts`) covers `apps/*` too. It must stay acyclic on runtime `dependencies`.
- **zod.** Every package or app that imports zod pins `"zod": "~3.25.76"`. The API imports `zod/v4`.
- **No live calls.** Tests and the E2E use only `FakeLlm`, `FakeTts` and the `--fake`/`STICK_FAKE=1` conventions. No test reads `.env`, and nothing in this plan uses the Anthropic key in `.env`.
- **No Docker, no installed Postgres.**
  - With no `DATABASE_URL`, the DB is PGlite. Tests use `memory://`. Dev uses `STICK_PGLITE_DIR`, default `out/.pglite`.
  - `DATABASE_URL=postgres://…` switches to node-postgres against Postgres 16, with the same schema and the same SQL migrations.
  - PGlite is single-process. So `npm run api` and `npm run worker` refuse to start without `DATABASE_URL`. `npm run dev` runs API + worker in one process and works on either.
- **Redis.** Tests in `apps/*/test` get a private `redis-server` on a free port from a vitest global setup. If the binary is missing, they fail with `redis-server not found: install Redis 7 (brew install redis) or set REDIS_SERVER_BIN`. Each test uses its own BullMQ `prefix`.
- **IDs and time.** Primary keys are uuid v7 from `uuid`'s `v7()`, generated in the app because Postgres 16 has no `uuidv7()`. Timestamps are `timestamptz`, and every table has `created_at` and `updated_at` (spec §8). Money is `numeric(12,6)`. The repositories convert the pg string to `number`.
- **Tenancy.** Every repository function on a business table takes `(db, workspaceId, …)` and filters by `workspace_id` in SQL. A row from another workspace behaves exactly like a missing row: `undefined` from repos, `404 not_found` from the API.
- **Film steps.** `FILM_STEPS = ['story','screenplay','validate','voice','timeline','gate','render','contact']`. Spec mapping: 1 story, 2 screenplay, 3 validate (repair lives inside screenplay, as today), 4 tts = voice, 6 timeline, 9a motion/pacing gate (run before render, as the CLI does, so a failure costs no render), 7+8 render (render + mix), 9 contact sheet. Step 5 (align) is out of scope.
- **Film statuses** are verbatim from spec §8: `queued|running|qa_failed|awaiting_review|approved|publishing|published|failed|cancelled|blocked_budget`. A gate failure is `qa_failed`. `publishing` and `published` have no transitions in P1.
- **Retries.** Each step job gets `attempts: 4` (the first try plus 3 retries, spec §6) with `backoff: { type: 'exponential', delay: 2000 }`. Only transient errors retry: network errnos, HTTP 429 and 5xx, `APIConnectionError`/`APIConnectionTimeoutError`. Logic errors fail the film at once, with `{ code, message, details }` in `step_runs.error`.
- **Budget.** The caps are `workspaces.max_cost_per_film_usd` and `max_cost_per_day_usd`. When a column is NULL, the env defaults apply: `STICK_MAX_COST_USD` (default 1) and `STICK_MAX_COST_PER_DAY_USD` (default 10). "Day" is the UTC day. Every LLM and TTS call is booked to `usage_events` and added to `films.cost_usd` in one transaction. The cap is checked before each step and before each paid call. Going over it sets `blocked_budget`. Nothing is skipped silently.
- **API envelope.**
  - Success: `{ "data": …, "error": null, "meta": { "request_id": … } }`. Lists add `meta.next_cursor` (null on the last page).
  - Error: `{ "data": null, "error": { "code", "message", "details" } }`.
  - Lists take `?limit=` (default 20, max 100) and `?cursor=`. The cursor is the last item's id; uuid v7 is time-ordered. Order is `id DESC` unless the route says otherwise.
- **Error codes:** `bad_request` 400 · `unauthorized` 401 · `forbidden` 403 · `csrf_failed` 403 · `not_found` 404 · `conflict` 409 · `idempotency_conflict` 409 · `invalid_screenplay` 422 · `rate_limited` 429 · `internal` 500. A 500 never carries a stack or SQL.
- **Secrets.** Secrets come from env only, through `loadServerConfig`, which validates at startup. Messages name the variable, never its value. Fastify/pino redact `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-csrf-token"]` and any `password` field.
- **Auth.**
  - Session cookie `sid`: 32 random bytes, base64url, `HttpOnly; Secure; SameSite=Lax; Path=/`, lifetime 30 days. The DB stores only its SHA-256.
  - CSRF: every cookie-authenticated POST/PATCH/DELETE needs the header `x-csrf-token` equal to the session's token. Bearer requests are exempt.
  - API tokens: `stk_` + 32 random bytes base64url. Only the SHA-256 hex is stored (`api_tokens.token_hash`).
  - Passwords: argon2id via `@node-rs/argon2`, default params, minimum 12 characters.
  - `Secure` cookies need HTTPS off localhost. On the phone, reach the API through `tailscale serve` (HTTPS), which fits spec §9's Tailscale access.
- **Rate limits.** 120 requests/min per principal (token id or session id, else the IP), and 10/min per IP on `POST /v1/auth/login`. They are stored in Redis. Over the limit returns `429 rate_limited`.
- **Signed asset URLs.** `GET /v1/assets/:id/url` returns `/v1/assets/:id/content?exp=<unix s>&sig=<hex>`. `sig = HMAC-SHA256(STICK_URL_SIGNING_KEY, "<assetId>.<exp>")`, compared timing-safe. `ASSET_URL_TTL_S = 900`. The content route needs no other auth, and it serves Range requests.
- **CLI unchanged.** `npm run make`/`render`/`preview` keep their flags, exit codes, run.json layout and messages. All 863 existing tests keep passing.

## Review Focus

1. **A step job is delivered twice, for example after a worker crash between uploading outputs and marking the run succeeded.** The second delivery must skip by `input_hash`, or redo the step cleanly. Either way: one asset row per `(film_version, path)`, and exactly one `succeeded` step_run per step. Covered by Task 6 `a re-delivered job leaves one asset per path and one succeeded run`.
2. **Cancel arrives while a step is running.** The step may finish, but the film stays `cancelled`. The next step is never enqueued, and finalize must not overwrite `cancelled` with `awaiting_review`. Covered by Task 6 `cancel during a step: the film stays cancelled and nothing is enqueued`.
3. **A request for another workspace's film, asset or cursor, or a tampered/expired signed URL.** The first must return 404, never the row. A bad `sig` or a past `exp` must return 403. Covered by Task 9 `asset of another workspace is 404; tampered or expired signature is 403` and Task 10 `film of another workspace is 404 on every film route`.
4. **The phone retries `POST /v1/films` after a timeout.** The same `Idempotency-Key` must return the same film and enqueue once. The same key with a different body must return 409. Covered by Task 10 `Idempotency-Key replay returns the same film and enqueues once; a different body is 409`.
5. **Two films render at once on one worker, sharing `cacheDir`.** SFX cache writes must not collide, and each job must use its own work dir. Covered by Task 1 `concurrent ensureSfx calls for one id all resolve` and Task 6 `two jobs never share a work dir`.

---

### Task 1: Plan-3 carry-overs — collision-free SFX cache; bounded loudnorm pass 1

**Files:**
- Modify: `packages/render/src/sfx.ts` (`ensureSfx` partial name), `packages/render/src/mix.ts` (`loudnormFor`, `mixFilm` opts)
- Test: `packages/render/test/sfx.test.ts`, `packages/render/test/mix.test.ts`

**Interfaces:**
- Produces:
  - `mixFilm(videoPath, audio, outPath, opts?: { ffmpegPath?: string; ffprobePath?: string; loudnessTimeoutMs?: number })`. The new option defaults to `LOUDNESS_TIMEOUT_MS = 120_000`.
  - `ensureSfx` keeps its signature.

- [ ] **Step 1: Write failing tests**
  - `sfx.test.ts` → `concurrent ensureSfx calls for one id all resolve to a valid wav and leave no partial files`:
    - `await Promise.all(Array.from({ length: 4 }, () => ensureSfx('ting', freshDir)))`.
    - All four return the same path, and `wavSeconds` of it is 0.6 ±0.01.
    - `readdirSync(freshDir)` equals `['ting@1.wav']`.
  - `mix.test.ts` → `loudness pass that hangs is killed after loudnessTimeoutMs`:
    - `ffmpegPath` is a temp shell script (`#!/bin/sh\nsleep 30`) and `ffprobePath` is a script that echoes `2.0`.
    - With `loudnessTimeoutMs: 300`, it rejects within 5 s with a message matching `/loudness pass timed out after 300 ms/`.
  - `mix.test.ts` → `loudness pass failure reports the stderr tail, not the filtergraph`:
    - The fake ffmpeg prints 30 numbered stderr lines and exits 1.
    - The message contains `line 30`, does not contain `line 10`, and contains neither `filter_complex` nor `amix=`.
- [ ] **Step 2: Run the tests.** Run `npx vitest run packages/render/test/sfx.test.ts packages/render/test/mix.test.ts`. Expected: FAIL. The concurrent test may also pass by luck, so check that the partial name is still fixed in the code.
- [ ] **Step 3: Implement.**
  - SFX partial name: `` `${path}.partial-${process.pid}-${randomBytes(4).toString('hex')}.wav` `` (the `.wav` suffix keeps ffmpeg's muxer choice). Rename onto `path` stays atomic, so concurrent writers produce the same bytes.
  - `loudnormFor` passes `{ timeout, killSignal: 'SIGKILL', maxBuffer }` to `execFile`. It catches the error and rethrows a new `Error`, never the `execFile` error, whose message embeds the command line:
    - on timeout (`killed`): `mixFilm: loudness pass timed out after <ms> ms`
    - otherwise: `mixFilm: loudness pass failed (exit <code>)` + `\n` + the last 10 stderr lines
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `fix(render): unique SFX partial names; loudness pass bounded and quiet`.

### Task 2: Shared film steps — one implementation for CLI and worker

Steps exist once, in `@stick/pipeline`. The CLI keeps its reuse logic and only delegates the "run" part.

**Files:**
- Create: `packages/core/src/film.ts` (export it from `index.ts`)
- Create: `packages/render/src/film.ts` (moved `renderMixed`, renamed `renderFilm`), `packages/render/src/audio-clips.ts` (moved from `scripts/lib/audio-clips.ts`), `packages/render/src/gates.ts`
- Create: `packages/pipeline/src/film-steps.ts`; add `@stick/render` to `packages/pipeline/package.json` dependencies
- Create: `packages/providers/src/metered.ts` and `packages/providers/src/llm/fake-film.ts` (`fakeFilmResponses`, moved from `scripts/lib/make-providers.ts`)
- Modify:
  - `scripts/make-film.ts`: each step's run branch calls `runFilmStep`
  - `scripts/lib/make-steps.ts`: shrinks to the reuse checks
  - `scripts/lib/render-steps.ts`: keeps only `renderWithAudio`
  - `scripts/lib/motion-gate.ts`: wraps `gateFindings`
  - `scripts/lib/run-state.ts`: `budgeted` delegates to `meteredLlm`
  - `scripts/lib/make-errors.ts`: maps the two new errors
  - `scripts/lib/make-providers.ts`, `scripts/render-film.ts`
- Delete: `scripts/lib/audio-clips.ts`
- Test: `packages/core/test/film.test.ts`, `packages/pipeline/test/film-steps.test.ts`, `packages/providers/test/metered.test.ts`; the existing `scripts/*.test.ts` stay unchanged

**Interfaces:**
- Produces in `@stick/core` (`film.ts`):
  - `FILM_STEPS`, `type FilmStep`, `FILM_STATUSES`, `type FilmStatus`.
  - `REDOABLE_STATUSES = ['awaiting_review','qa_failed','failed','cancelled','blocked_budget','approved']`.
  - `canTransition(from: FilmStatus, to: FilmStatus): boolean`, with exactly these edges:
    - `queued→running|cancelled|blocked_budget|failed`
    - `running→awaiting_review|qa_failed|failed|cancelled|blocked_budget`
    - `awaiting_review→approved`
    - every `REDOABLE_STATUSES` member `→queued` (a new version)
  - `QUEUES = { film: 'film', render: 'render' } as const`, `stepQueue(step: FilmStep): 'film' | 'render'` (render → `render`, everything else → `film`).
  - `interface StepJob { workspaceId: string; filmId: string; filmVersionId: string; step: FilmStep }`, `stepJobId(versionId, step) => \`${versionId}.${step}\``.
  - `STEP_JOB_OPTIONS = { attempts: 4, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 1000 }`.
  - `type FilmEvent = { type: 'step'; filmId; versionId; step: FilmStep; status: 'running'|'succeeded'|'failed'|'skipped'; attempt: number; at: string } | { type: 'film'; filmId; status: FilmStatus; at: string }`.
  - `filmEventChannel(filmId) => \`film-events:${filmId}\``.
  - `STEP_FILES` (moved here from pipeline so `@stick/db` can use it without depending on render; the table is in the pipeline block below).
  - `interface StorageProvider` (used from Task 5):
    - `putFile(key: string, localPath: string): Promise<{ bytes: number; sha256: string }>`
    - `getFile(key: string, localPath: string): Promise<void>`
    - `localPath(key: string): string | undefined`
    - `delete(key: string): Promise<void>`
- Produces in `@stick/render`:
  - `renderFilm(tl, { audioDir, sfxCacheDir, music?, catalog }, out): Promise<{ frames; seconds }>`.
  - `audioClips`, `audioDurations` and `spokenBeatIds`, unchanged except that they throw plain `Error` with the same messages.
  - `gateFindings(tl, catalog, check = checkMotion, pace = checkPacing): string[]`. Lines are formatted exactly as `gateMotion` does today.
- Produces in `@stick/providers`:
  - `interface Ledger { check(): void | Promise<void>; bookLlm(u: LlmUsage): void | Promise<void>; bookTts(chars: number, providerId: string): void | Promise<void> }`.
  - `meteredLlm(inner: LlmProvider, ledger: Ledger): LlmProvider`, with today's `budgeted` semantics: check before the call, book on return, and book the `usage` carried by an error that is thrown after the call returned.
  - `meteredTts(inner: TtsProvider, ledger: Ledger): TtsProvider` checks, then books `text.length` after synthesis.
  - `fakeFilmResponses(): { story: unknown; screenplay: unknown }`.
- Produces in `@stick/pipeline` (`film-steps.ts`):
  - Re-exports `STEP_FILES: Record<FilmStep, { reads: string[]; writes: string[] }>`, which is defined in `@stick/core` `film.ts`. A trailing `/` means every file under that directory:
    - story: reads `[]`, writes `['story.json']`
    - screenplay: reads `['story.json']`, writes `['screenplay.json']`
    - validate: reads `['screenplay.json']`, writes `[]`
    - voice: reads `['screenplay.json']`, writes `['audio/']`
    - timeline: reads `['screenplay.json','audio/']`, writes `['timeline.json']`
    - gate: reads `['timeline.json']`, writes `['gate.json']`
    - render: reads `['timeline.json','audio/']`, writes `['film.mp4']`
    - contact: reads `['timeline.json']`, writes `['contact.png']`
  - `STEP_VERSIONS: Record<FilmStep, string>`: story = `STORY_PROMPT_VERSION`, screenplay = `SCREENPLAY_PROMPT_VERSION`, render = `` `render@1+sfx@${SFX_VERSION}` ``, all others `'v1'`. Bump one when that step's output for the same input changes.
  - `interface StepEnv { dir: string; llm: LlmProvider; tts: TtsProvider; catalog: Catalog; sfxCacheDir: string; music?: string; skipGates?: boolean }`.
  - `interface FilmInput { topic: string; genre?: Story['genre']; recent: RecentStory[] }`.
  - `interface StepReport { libraryRequests?: string[]; repairRounds?: number; durationSec?: number; meta?: Record<string, unknown> }`. Story returns `meta: { title, logline }`. Screenplay returns `libraryRequests` and `repairRounds`. Timeline returns `durationSec`.
  - `runFilmStep(step: FilmStep, env: StepEnv, input: FilmInput): Promise<StepReport>`. It reads its `reads` from `env.dir` and writes its `writes` there with `writeArtifact`-style temp + rename. Render writes `film.partial.mp4` and then renames it. JSON inputs are parsed with `StorySchema`/`parseScreenplay`, and an invalid input throws.
  - `class ScreenplayInvalidError extends Error { issues: Issue[] }`, thrown by validate.
  - `class GateFailedError extends Error { findings: string[] }`. The gate step writes `gate.json = { findings }` (also when it is empty), then throws if findings remain and `!skipGates`.

- [ ] **Step 1: Write failing tests**
  - `film.test.ts`:
    - `canTransition allows exactly the listed edges`: a table over all 10×10 pairs against the edge list above.
    - `stepQueue sends only render to the render queue`.
  - `metered.test.ts`:
    - `meteredLlm books usage and refuses the next call when check throws`.
    - `meteredLlm books usage carried by an error thrown after the call returned`.
    - `meteredTts books character count`.
  - `film-steps.test.ts`, using FakeLlm/FakeTts and the phan-so responses from `fakeFilmResponses()` in a temp dir:
    - `running every step in order produces every STEP_FILES write`. `film.mp4` is 1080×1920 and its duration is within 0.1 s of `durationSec`. Mark it slow (300 s).
    - `each step reads only its declared reads`: run each step in a fresh dir that holds only that step's `reads`, copied from the full run, and expect success.
    - `validate throws ScreenplayInvalidError for a screenplay with an unknown action`.
    - `gate writes gate.json and throws GateFailedError when findings exist`: call `runFilmStep('gate', …)` on a timeline whose beat is idle for 3 s, built as in `pacing.test.ts`.
    - `gate with skipGates writes findings and does not throw`.
- [ ] **Step 2: Run the tests.** Run `npx vitest run packages/core/test/film.test.ts packages/providers/test/metered.test.ts packages/pipeline/test/film-steps.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Move the code, implement `runFilmStep`, then rewire the CLI.
  - In `make-film.ts`, each step keeps today's reuse condition:
    - story/screenplay reuse when the JSON exists and parses (a corrupt file is still exit 1, untouched)
    - voice/render/contact reuse when the run.json marker is set and the outputs exist
    - validate, timeline and gate always run; they are cheap and have no marker
  - The run branch is `run.clearFrom(step)` → `runFilmStep` → `run.update(report fields)` → `run.markStep(step)` for marked steps.
  - `describeFailure` maps `ScreenplayInvalidError` → exit 2 (same text as `assertValid` today) and `GateFailedError` → exit 3 (same text as `gateMotion` today).
  - The CLI still builds its own providers. Fake mode uses `fakeFilmResponses()`.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS, with every existing `scripts/make-film.test.ts` and `render-film.test.ts` case unchanged.
- [ ] **Step 5: Commit.** Message: `refactor: film steps shared by CLI and worker (pipeline runFilmStep)`.

### Task 3: `packages/db` — schema, migrations, client (PGlite or Postgres), identity repositories

**Files:**
- Create in `packages/db`:
  - `package.json` (`@stick/db`; deps `drizzle-orm`, `@electric-sql/pglite`, `pg`, `uuid`, `@node-rs/argon2`, `@stick/core`; dev deps `drizzle-kit`, `@types/pg`)
  - `drizzle.config.ts`, `migrations/` (generated by drizzle-kit and committed)
  - `src/schema.ts`, `src/client.ts`, `src/errors.ts`, `src/pagination.ts`, `src/testing.ts`, `src/index.ts`
  - `src/repositories/identity.ts`, `workspaces.ts`, `channels.ts`, `characters.ts`, `audit.ts`
- Modify: root `package.json` (scripts `db:generate`, `coverage:db`; devDep `@vitest/coverage-v8`), `packages/core/test/graph.test.ts` (also scan `apps/*` when present), `tsconfig.base.json`
- Test: `packages/db/test/schema.test.ts`, `packages/db/test/identity.test.ts`, `packages/db/test/workspace-repos.test.ts`

**Schema (`schema.ts`).** The spec §8 columns verbatim, plus `updated_at`. Additions and cuts:
- `users`: + `password_hash text NOT NULL`. `email` is unique, stored lowercased and trimmed.
- `workspaces`: as spec.
- `workspace_members`: as spec, role CHECK `owner|editor|viewer`.
- `api_tokens`: as spec. `token_hash` is unique.
- **`sessions`** (new, required by §9 cookie auth): `id`, `user_id` FK, `workspace_id` FK, `token_hash text UNIQUE`, `csrf_token text`, `expires_at`, `created_at`.
- `channels`, minimal: `id, workspace_id, platform CHECK ('tiktok'), display_name, locale DEFAULT 'vi-VN', review_policy CHECK ('manual','auto_if_score') DEFAULT 'manual', auto_score_threshold numeric, created_at, updated_at`. `target_duration_sec`, `style` and `oauth_credentials_encrypted` are deferred to plan 5/P3.
- `characters`: as spec.
- `films`: as spec, with `status` CHECK over `FILM_STATUSES` and `topic_id uuid NULL` without an FK (topics are deferred). Additions:
  - **`brief text NULL`**: the §9 `{title, brief}` input has to live somewhere.
  - **`idempotency_key text NULL`**, with a unique index `(workspace_id, idempotency_key)`.
- `film_versions`, `step_runs`, `assets`, `reviews`, `usage_events`, `audit_log`: as spec. `step_runs.step` and `film_versions.restart_from_step` are CHECKed over `FILM_STEPS`. `assets.meta` holds `{ path }`, the work-dir relative path.
- Indexes:
  - from the spec: `films(workspace_id, status, created_at DESC)`, `step_runs(film_version_id, step)`, `usage_events(workspace_id, created_at)`
  - plus: `assets(film_version_id)`, `sessions(expires_at)`
  - `topics(workspace_id, status)` comes with the topics table.
- Deferred tables: `topics`, `publications`, `library_items`, `library_requests`.
- Every `id` column is `uuid().primaryKey().$defaultFn(v7)`.

**Interfaces:**
- Produces:
  - `type Db = PgDatabase<PgQueryResultHKT, typeof schema>`.
  - `createDb(opts: { url?: string; pgliteDir?: string }): Promise<{ db: Db; close(): Promise<void> }>`:
    - With `url`, it uses node-postgres `Pool` and wraps the migration in `pg_advisory_lock(72_74_01)`, so the API and worker cannot race.
    - Otherwise it uses `new PGlite(pgliteDir ?? 'memory://')`.
    - It always runs the migrations in `packages/db/migrations`.
  - `createTestDb()` and `seedWorkspace(db, overrides?): Promise<{ user; workspace; channel; token: string; password: string }>` from `@stick/db/testing` (package `exports` `./testing`).
  - Errors: `class NotFoundError`, `class ConflictError` (`code`, `details`).
  - `page<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null }`. Callers fetch `limit + 1` rows.
  - Identity:
    - `createUser(db, { email, name, password }): Promise<User>` hashes with argon2id and rejects passwords shorter than 12.
    - `verifyPassword(db, email, password): Promise<User | undefined>` returns `undefined` on an unknown email or a wrong password, in similar time: hash a dummy password when the email is unknown.
    - `createWorkspaceWithOwner(db, { name, userId, maxCostPerFilmUsd?, maxCostPerDayUsd? }): Promise<Workspace>`.
    - `type Role = 'owner'|'editor'|'viewer'`.
    - `interface Principal { userId; workspaceId; role: Role; via: 'session'|'token'; sessionId?; tokenId?; csrfToken? }`.
    - `createSession(db, { userId, workspaceId, ttlSec = 2_592_000 }): Promise<{ token; csrfToken; expiresAt }>`, `findSession(db, token): Promise<Principal | undefined>` (expired → undefined), `deleteSession(db, token)`.
    - `createApiToken(db, { workspaceId, userId, name }): Promise<{ id; token }>`, `findApiToken(db, token): Promise<Principal | undefined>` (revoked → undefined; sets `last_used_at`).
  - `getWorkspace(db, ws)`, `updateWorkspace(db, ws, patch: { name?; maxCostPerFilmUsd?: number | null; maxCostPerDayUsd?: number | null })`.
  - Channels: `listChannels(db, ws, { limit, cursor? })`, `getChannel(db, ws, id)`, `createChannel(db, ws, input)`, `updateChannel(db, ws, id, patch)`.
  - Characters: `listCharacters` (excludes archived), `getCharacter`, `createCharacter`, `updateCharacter`, `archiveCharacter`, all `(db, ws, …)`.
  - `audit(db, ws, { actorId?, action, target, data? }): Promise<void>`.

- [ ] **Step 1: Write failing tests**
  - `schema.test.ts`:
    - `migrations apply on a fresh PGlite and create every P1 table`: query `information_schema.tables`.
    - `ids are uuid v7`: the version nibble is `7`, and two inserts sort by id in insert order.
    - `the spec indexes exist`: query `pg_indexes`.
    - `a step outside FILM_STEPS is rejected by the CHECK`.
  - `identity.test.ts`:
    - `email is unique case-insensitively`.
    - `verifyPassword accepts the right password and rejects a wrong one and an unknown email`.
    - `a password under 12 characters is refused`.
    - `session token is stored hashed, expires, and delete ends it`: the table holds no raw token.
    - `api token is stored as sha256 hex, revoked tokens are refused, last_used_at is set`.
  - `workspace-repos.test.ts`:
    - `a channel of workspace A is invisible from workspace B (get, list, update)`.
    - `archived characters drop out of the list`.
    - `cursor paging returns every row once, newest first, and next_cursor null at the end`.
    - `updateWorkspace can clear a cap to null`.
- [ ] **Step 2: Run the tests.** Run `npx vitest run packages/db`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Write the schema and run `npm run db:generate`, which wraps `drizzle-kit generate --config packages/db/drizzle.config.ts`. Commit the SQL.
  - Implement client, repos and testing helpers.
  - The `coverage:db` script is `vitest run packages/db --coverage.enabled --coverage.include='packages/db/src/**' --coverage.thresholds.lines=80 --coverage.thresholds.functions=80`. It runs with the unit project once Task 6 adds projects.
- [ ] **Step 4: Run and verify.** Run `npm test && npm run typecheck`. Then run `npm run db:generate` again and expect drizzle-kit to report no schema changes.
- [ ] **Step 5: Commit.** Message: `feat(db): drizzle schema, migrations, PGlite/Postgres client, identity repos`.

### Task 4: Film repositories — versions, step runs, assets, reviews, usage

**Files:**
- Create: `packages/db/src/repositories/films.ts`, `steps.ts`, `reviews.ts`, `usage.ts`
- Test: `packages/db/test/films.test.ts`, `packages/db/test/steps.test.ts`, `packages/db/test/usage.test.ts`

**Interfaces:**
- Consumes: `canTransition`, `FILM_STEPS`, `REDOABLE_STATUSES` and `STEP_FILES` from `@stick/core` (never `@stick/pipeline`, which would pull render and canvas into db), plus `NotFoundError`/`ConflictError` from Task 3. A local `stepOfPath(path)` maps an asset path to the step whose `writes` contain it.
- Produces, every function taking `(db, ws, …)`:
  - `createFilm(db, ws, { channelId, title, brief?, createdBy, idempotencyKey? }): Promise<{ film; version; created: boolean }>`:
    - One transaction: the film starts `queued` with `current_version 1`, and version 1 gets `reason 'initial'` and `restart_from_step NULL`.
    - An existing `idempotencyKey` returns that film with `created: false`.
    - If its `channelId/title/brief` differ, it throws `ConflictError('idempotency_conflict')`.
  - `getFilm(db, ws, id)`, `listFilms(db, ws, { status?, channelId?, limit, cursor? })`.
  - `filmDetail(db, ws, id): Promise<{ film; version; steps: StepRun[]; assets: Asset[] } | undefined>`. `steps` holds the current version's runs, latest attempt per step.
  - `setFilmStatus(db, ws, filmId, to: FilmStatus): Promise<boolean>`. It is a single conditional `UPDATE … WHERE status IN (<every from with canTransition(from,to)>)` and returns whether a row changed. That conditional update is what keeps a cancel race-safe.
  - `createVersion(db, ws, filmId, { reason, restartFrom: FilmStep, screenplay?: { storageKey; bytes; sha256 } }): Promise<FilmVersion>`. One transaction:
    1. Throw `ConflictError('conflict')` unless the film is in `REDOABLE_STATUSES`.
    2. Insert `version = current+1` with `parent_version = current`.
    3. Copy the parent's asset rows written by steps before `restartFrom` into the new version. They are new rows with the same `storage_key`.
    4. If `screenplay` is given, replace the `screenplay.json` asset.
    5. Set `current_version` and status `queued`.
  - `recentStories(db, ws, channelId, n = 30): Promise<{ title; logline }[]>`: from `story` assets' `meta`, newest first.
  - Step runs:
    - `findSucceededRun(db, versionId, step, inputHash)`, `startRun(db, { versionId, step, attempt, inputHash }): Promise<StepRun>`, `finishRun(db, runId, { status: 'succeeded'|'failed'|'skipped'; error? })`.
    - The version id is reached only after a scoped film lookup, so these take no `ws`. Document this on the functions.
  - Assets:
    - `assetsOf(db, ws, versionId)`, `getAsset(db, ws, id)`.
    - `replaceAsset(db, ws, { filmVersionId, kind, path, storageKey, mime, bytes, sha256, meta? }): Promise<Asset>` deletes any asset with the same `(film_version_id, meta.path)` in the same transaction.
    - The path → kind map: `story.json`→story, `screenplay.json`→screenplay, `timeline.json`→timeline, `audio/*`→audio, `gate.json`→qa_report, `film.mp4`→final, `contact.png`→contact_sheet. Export it as `assetKindOf(path)`.
  - `insertReview(db, { filmVersionId, reviewerId, decision, reason?, redoFromStep? })`.
  - Usage:
    - `bookUsage(db, ws, { filmId, filmVersionId, step, provider, model, units, costUsd })` inserts `usage_events` and does `films.cost_usd += cost` in one transaction.
    - `spentOnDay(db, ws, day: Date): Promise<number>` covers the UTC day.
    - `usageSummary(db, ws, { from, to }): Promise<{ totalUsd; byDay: { day; costUsd }[]; byProvider: { provider; model; costUsd }[]; byFilm: { filmId; title; costUsd }[] }>`.

- [ ] **Step 1: Write failing tests**
  - `films.test.ts`:
    - `createFilm makes version 1 queued`.
    - `same idempotency key returns the same film; different title throws idempotency_conflict`.
    - `setFilmStatus refuses an illegal edge and returns false`: approved → running.
    - `cancel wins over a late running→awaiting_review`: set cancelled, then `setFilmStatus(…, 'awaiting_review')` returns false and the status stays cancelled.
    - `createVersion from voice copies story/screenplay assets, not audio or later`.
    - `createVersion on a running film is a conflict`.
    - `film of workspace A is undefined from workspace B in get, list and filmDetail`.
  - `steps.test.ts`:
    - `findSucceededRun matches only same version, step and hash`.
    - `replaceAsset keeps one row per version and path`.
    - `assetKindOf maps every STEP_FILES write`.
  - `usage.test.ts`:
    - `bookUsage adds to films.cost_usd atomically`: 10 concurrent bookings of 0.1 make 1.0.
    - `spentOnDay counts only that UTC day`.
    - `usageSummary groups by day, provider and film`.
- [ ] **Step 2: Run the tests.** Run `npx vitest run packages/db`. Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the repositories.
- [ ] **Step 4: Run the tests and coverage.** Run `npm test && npm run typecheck && npm run coverage:db`. Expected: PASS, with db line and function coverage ≥ 80%.
- [ ] **Step 5: Commit.** Message: `feat(db): film, version, step-run, asset, review and usage repositories`.

### Task 5: Storage adapter and server config

**Files:**
- Create: `packages/providers/src/storage/fs.ts`, `packages/providers/src/server-config.ts`
- Modify: `packages/providers/src/index.ts`
- Create: `.env.example`, listing every variable below with placeholder values and no secrets
- Test: `packages/providers/test/storage.test.ts`, `packages/providers/test/server-config.test.ts`

**Interfaces:**
- Consumes: `StorageProvider` from Task 2.
- Produces:
  - `class FsStorage implements StorageProvider`, constructed with `{ root: string }`:
    - `assertKey(key)` accepts only `/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/`, with no `.` or `..` segment.
    - `putFile` copies to a temp name, then renames, and returns `{ bytes, sha256 }`.
    - `localPath(key)` returns the absolute path under `root`.
  - `storageKey(ws, filmId, version, path) => \`ws/${ws}/films/${filmId}/v${version}/${path}\``.
  - `interface ServerConfig { databaseUrl?: string; pgliteDir: string; redisUrl: string; storageDir: string; cacheDir: string; host: string; port: number; urlSigningKey: string; fake: boolean; anthropicApiKey?: string; llmModel: string; maxCostPerFilmUsd: number; maxCostPerDayUsd: number }`.
  - `loadServerConfig(env, role: 'api' | 'worker' | 'dev'): ServerConfig`, zod-validated, throwing `ConfigError` naming the variable:

| Variable | Default | Required |
|---|---|---|
| `DATABASE_URL` | none (PGlite) | must start with `postgres://` or `postgresql://` when set |
| `STICK_PGLITE_DIR` | `out/.pglite` | — |
| `REDIS_URL` | `redis://127.0.0.1:6379` | — |
| `STICK_STORAGE_DIR` | `out/storage` | — |
| `STICK_CACHE_DIR` | `out/.cache` | — |
| `HOST` / `PORT` | `127.0.0.1` / `3000` | — |
| `STICK_URL_SIGNING_KEY` | — | api, dev: ≥ 32 chars |
| `STICK_FAKE` | `0` | — |
| `ANTHROPIC_API_KEY` | — | worker, dev when `STICK_FAKE` ≠ 1 |
| `STICK_LLM_MODEL` | `claude-sonnet-5-5` | must be priced (`costUsd` probe, as `makeProviders` does) |
| `STICK_MAX_COST_USD` / `STICK_MAX_COST_PER_DAY_USD` | `1` / `10` | positive numbers |

- [ ] **Step 1: Write failing tests**
  - `storage.test.ts`:
    - `put then get round-trips bytes and reports sha256`.
    - `keys with .., absolute paths, backslashes or empty segments are refused`.
    - `localPath stays under root`.
    - `delete of a missing key is not an error`.
  - `server-config.test.ts`:
    - `defaults apply`.
    - `api role without STICK_URL_SIGNING_KEY names the variable`.
    - `worker without ANTHROPIC_API_KEY fails unless STICK_FAKE=1`.
    - `a bad DATABASE_URL scheme is refused`.
    - `no error message contains the value of any variable`: set each secret to a marker string and assert the marker is absent.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement both modules.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(providers): filesystem storage adapter and validated server config`.

### Task 6: Worker step runner — idempotent, budgeted, cancellable step jobs (no queue yet)

**Files:**
- Create in `apps/worker`:
  - `package.json` (`@stick/worker`; deps `@stick/core`, `@stick/db`, `@stick/pipeline`, `@stick/providers`, `@stick/library`, `pino`, `bullmq`, `ioredis`)
  - `src/run-step.ts`, `src/workdir.ts`, `src/hash.ts`, `src/errors.ts`, `src/budget.ts`, `src/providers.ts`
- Modify:
  - root `package.json`: workspaces add `apps/*`
  - `vitest.config.ts`: two projects. `unit` includes `packages/*/test/**` and `scripts/**`. `server` includes `apps/*/test/**/*.test.ts`, has `globalSetup: 'vitest.redis-setup.ts'`, and sets `testTimeout: 300_000`.
- Create: `vitest.redis-setup.ts`. It spawns `redis-server --port <free> --save '' --appendonly no`, waits for `PING`, calls `provide('redisUrl', …)` and kills the server on teardown. It fails with the Global Constraints message when the binary is missing. Task 6 tests do not use Redis yet; the setup lands here because this is the first server-project task.
- Test: `apps/worker/test/run-step.test.ts`, `apps/worker/test/errors.test.ts`

**Interfaces:**
- Consumes: `runFilmStep`, `STEP_FILES`, `STEP_VERSIONS`, `GateFailedError`, `ScreenplayInvalidError`, `ScreenplayRejectedError`, `StoryRejectedError`, `meteredLlm`/`meteredTts`/`Ledger`, the Task 3–4 repositories, `FsStorage`, `storageKey`, `canTransition`.
- Produces:
  - `inputHash(step, version: string, inputs: { path: string; sha256: string }[], params: Record<string, string>): string`. It is the SHA-256 of canonical JSON with inputs sorted by path. `params` is `{ topic }` for story and `{}` otherwise.
  - `classify(e: unknown): 'transient' | 'budget' | 'gate' | 'cancelled' | 'logic'`:
    - transient: Anthropic SDK errors with `status` 429 or ≥500, `APIConnectionError`/`APIConnectionTimeoutError`, and errno `ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED`
    - budget: `BudgetExceededError`
    - gate: `GateFailedError`
    - logic: everything else
  - `class BudgetExceededError extends Error { scope: 'film' | 'day'; spentUsd: number; capUsd: number }`, `class TransientStepError extends Error { cause }`.
  - `checkBudget(db, ws, filmId, defaults: { film: number; day: number }, now?: Date): Promise<void>`. Spend at or above a cap throws, film cap first.
  - `stepProviders(cfg: ServerConfig, step: FilmStep, ledger: Ledger): { llm: LlmProvider; tts: TtsProvider }`:
    - fake: `new FakeLlm([fakeFilmResponses()[step]])` for story/screenplay (an empty queue otherwise) and `FakeTts`
    - real: `ClaudeLlm` and `SayTts`
    - TTS is always wrapped in `cachedTts(…, join(cacheDir,'tts'))`, and both are metered
  - `interface WorkerDeps { db: Db; storage: StorageProvider; cfg: ServerConfig; log: pino.Logger; enqueue(job: StepJob): Promise<void>; publish(e: FilmEvent): Promise<void>; providers?: typeof stepProviders; runStep?: typeof runFilmStep; now?: () => Date }`. The last three are test seams.
  - `runStepJob(deps: WorkerDeps, job: StepJob, attempt: { n: number; final: boolean }): Promise<'succeeded' | 'skipped' | 'stopped' | 'failed'>`. Order:
    1. Load the film scoped to `job.workspaceId`. If it is missing, or its status is not `queued`/`running`, or `job.filmVersionId` is not the current version → `'stopped'`. This is the cancel check, and it also drops jobs of superseded versions.
    2. Run `checkBudget`. On `BudgetExceededError`: `setFilmStatus(blocked_budget)`, publish, return `'failed'`.
    3. Make a unique work dir with `mkdtemp(join(cacheDir, 'work', '<versionId>-<step>-'))`. Download the version's assets matching the step's `reads`, and compute `inputHash`.
    4. If `findSucceededRun` matches → publish skipped, enqueue the next step, return `'skipped'`.
    5. `startRun` with `attempt.n`, `setFilmStatus(running)` (a false result from queued→running is fine when it is already running), publish.
    6. Run the step with a ledger that `checkBudget`s before each call and `bookUsage`s after it. The `provider` is `'anthropic'|'fake'|tts id`, and `units` are the token counts or `{ chars }`. `recent` comes from `recentStories`, and the topic is `brief ? \`${title}\n\n${brief}\` : title`.
    7. On success: upload every file under `writes` with `replaceAsset`, using story `meta {title, logline}` and screenplay `meta {libraryRequests, repairRounds}`. Then `finishRun(succeeded)`, publish, and either enqueue the next step or finalize.
    8. Finalize after `contact`: `setFilmStatus(awaiting_review)`. `review_policy 'auto_if_score'` also lands in `awaiting_review`, because P1 has no QA score (`// shortcut: no qa_score in P1, auto_if_score behaves as manual; upgrade with LLM-vision QA`).
    9. On error, `finishRun(failed, { code: classify(e), message, details })`. Details are issues, findings or library requests. Then by class:
       - `gate`: upload `gate.json`, set `qa_failed`
       - `budget`: set `blocked_budget`
       - `transient` with `!final`: throw `TransientStepError`, so the queue retries
       - `transient` with `final`, or `logic`: set `failed`
       - in every case, publish
    10. Always remove the work dir in `finally`.

- [ ] **Step 1: Write failing tests.** `run-step.test.ts` uses `createTestDb`, `seedWorkspace`, `FsStorage` in a temp dir, `cfg.fake = true`, and records `enqueue`/`publish` in arrays.
  - `story job writes story.json as a story asset, records a succeeded run and enqueues screenplay`.
  - `a re-delivered job leaves one asset per path and one succeeded run` (Review Focus 1): run the same job twice. The second returns `'skipped'`.
  - `cancel during a step: the film stays cancelled and nothing is enqueued` (Review Focus 2): a `runStep` stub sets the film `cancelled` mid-step via `setFilmStatus`, then resolves. Expect the status `cancelled` and `enqueue` uncalled.
  - `a cancelled film's job is stopped before any work`: `runStep` is never called.
  - `a job for a superseded version is stopped`.
  - `film cap: a step whose call books $2 against a $1 cap blocks the next call and sets blocked_budget`: the stub `runStep` calls `env.llm.generate` twice. The providers seam returns an LLM that reports `{ model: 'claude-sonnet-5-5', inputTokens: 1_000_000 }`. Expect one usage_event, `films.cost_usd` 2, and status `blocked_budget`.
  - `day cap already reached blocks before the step runs`.
  - `GateFailedError sets qa_failed with findings in step_runs.error and a qa_report asset`.
  - `ScreenplayRejectedError fails the film with issues and library requests in the error`.
  - `transient error on attempt 1 throws TransientStepError and leaves the film running; on the final attempt the film fails`.
  - `two jobs never share a work dir` (Review Focus 5): run two concurrent stub steps that record `env.dir`, and expect the dirs to differ and be removed afterwards.
  - `errors.test.ts` → `classify table`: 429, 503, 400, ECONNRESET, APIConnectionError, BudgetExceededError, GateFailedError, plain Error.
- [ ] **Step 2: Run the tests.** Run `npx vitest run --project server apps/worker`. Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the modules.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(worker): idempotent budgeted step runner over storage and step_runs`.

### Task 7: Worker queues — BullMQ `film` and `render` queues, retries, events, entrypoints

**Files:**
- Create in `apps/worker`: `src/queues.ts`, `src/events.ts`, `src/main.ts`, `src/start.ts`
- Modify: root `package.json` (scripts `"worker": "tsx apps/worker/src/main.ts"`, `"dev": "tsx apps/api/src/dev.ts"` added in Task 8)
- Test: `apps/worker/test/queues.test.ts`

**Interfaces:**
- Consumes: `runStepJob`, `QUEUES`, `stepQueue`, `stepJobId`, `STEP_JOB_OPTIONS`, `filmEventChannel`.
- Produces:
  - `createQueues(redisUrl: string, opts?: { prefix?: string }): { film: Queue; render: Queue; close(): Promise<void> }`.
  - `enqueueStep(queues, job: StepJob, opts?: { backoffMs?: number }): Promise<void>` adds to `queues[stepQueue(job.step)]` with name `job.step`, `jobId: stepJobId(…)` and `STEP_JOB_OPTIONS`. `backoffMs` overrides the delay and exists for tests.
  - `redisPublisher(redisUrl): { publish(e: FilmEvent): Promise<void>; close() }` publishes JSON to `filmEventChannel(e.filmId)`.
  - `startWorker(deps: Omit<WorkerDeps,'enqueue'|'publish'>, opts: { redisUrl: string; prefix?: string; filmConcurrency = 2; renderConcurrency = 1; backoffMs?: number }): Promise<{ close(): Promise<void> }>`:
    - It starts one BullMQ `Worker` per queue. Each uses ioredis with `maxRetriesPerRequest: null`.
    - The processor calls `runStepJob(deps, job.data, { n: job.attemptsMade + 1, final: job.attemptsMade + 1 >= job.opts.attempts })`.
    - `TransientStepError` propagates so BullMQ retries.
  - `main.ts`: runs `loadServerConfig(process.env, 'worker')` and refuses PGlite (`worker needs DATABASE_URL: PGlite is single-process, use npm run dev`). Then `createDb`, `startWorker`, and a graceful close on SIGTERM/SIGINT. pino logs carry `filmId`, `versionId` and `step` bindings.

- [ ] **Step 1: Write failing tests.** `queues.test.ts` uses `inject('redisUrl')`, a unique prefix per test, PGlite and `cfg.fake = true`.
  - `enqueueStep puts render on the render queue and every other step on film`: check `getJob(stepJobId(…))` on each queue.
  - `enqueuing the same step twice keeps one job`.
  - `a fake film runs story→contact through both queues to awaiting_review`. Use `createFilm` + `enqueueStep(story)`, then poll `getFilm` until terminal (timeout 240 s). Expect:
    - `awaiting_review`
    - 8 succeeded step_runs
    - a `final` asset whose storage file has `ffprobe` 1080×1920
    - the render step_run processed on the render queue (assert by a `Worker` `completed` listener's `job.queueName`)
  - `a transient failure retries with backoff and succeeds on attempt 3`: the providers seam returns an LLM that throws `{ status: 503 }` twice, with `backoffMs: 10`. Expect story step_runs attempts 1 and 2 failed and 3 succeeded.
  - `four transient failures fail the film`.
  - `step and film events are published to film-events:<id>`: subscribe with a second ioredis connection and expect `step running`/`step succeeded` for story, then `film awaiting_review`.
- [ ] **Step 2: Run the tests.** Run `npx vitest run --project server apps/worker`. Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the modules.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(worker): BullMQ film and render queues with retry, events and entrypoint`.

### Task 8: API foundation — Fastify app, envelope, OpenAPI, auth, rate limit, health, CLI scripts

**Files:**
- Create in `apps/api`:
  - `package.json` (`@stick/api`; deps `fastify`, `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/swagger`, `@fastify/static`, `fastify-type-provider-zod`, `ioredis`, `zod ~3.25.76`, `@stick/core`, `@stick/db`, `@stick/providers`, `@stick/pipeline`, `@stick/library`)
  - `src/app.ts`, `src/errors.ts`, `src/envelope.ts`, `src/auth.ts`
  - `src/routes/auth.ts`, `src/routes/me.ts`, `src/routes/workspace.ts`, `src/routes/health.ts`
  - `src/main.ts`, `src/dev.ts`
- Create: `scripts/seed.ts`, `scripts/create-token.ts`. Root `package.json` scripts: `api`, `dev`, `seed`, `token`.
- Test: `apps/api/test/helpers.ts`, `apps/api/test/auth.test.ts`, `apps/api/test/foundation.test.ts`, `scripts/seed.test.ts`

Pick the `fastify-type-provider-zod` version whose peer range accepts zod 3.25.x's `zod/v4` entry. Check with `npm view fastify-type-provider-zod peerDependencies` before installing. `@fastify/swagger` uses its `jsonSchemaTransform`.

**Interfaces:**
- Consumes: the identity and workspace repositories, `loadServerConfig`, `enqueueStep`/`createQueues` (dev.ts only), `startWorker` (dev.ts only).
- Produces:
  - `interface ApiDeps { db: Db; storage: StorageProvider; cfg: ServerConfig; redis: Redis; enqueue(job: StepJob): Promise<void>; subscribe(filmId: string, onEvent: (e: FilmEvent) => void): () => void }`.
  - `buildApp(deps: ApiDeps): Promise<FastifyInstance>`. It registers, in order:
    1. request id (`x-request-id` or uuid v7)
    2. the pino redaction from Global Constraints
    3. the zod type provider and swagger at `/v1/openapi.json` (OpenAPI 3.1, title `Stick Studio API`)
    4. cookie
    5. rate limit
    6. the auth hook
    7. the routes
    8. the error handler
  - `class ApiError extends Error { status; code; details? }`, with helpers `notFound()`, `conflict(code?, details?)`, `forbidden()`.
  - The error handler maps zod validation → 400 `bad_request` with details = issues, `NotFoundError` → 404, `ConflictError` → 409 with its code, and rate-limit → 429. Everything else → 500 `internal` with the message `internal error`, logged with the request id.
  - `ok(reply, data, meta?)` / `okList(reply, { items, nextCursor })` write the envelope.
  - Auth hook:
    - `Authorization: Bearer stk_…` → `findApiToken`.
    - Otherwise the `sid` cookie → `findSession`.
    - Otherwise 401, except on routes with `config: { public: true }` (`/healthz`, `/readyz`, `/v1/auth/login`, `/v1/openapi.json`, the asset content route).
    - Cookie principals on POST/PATCH/DELETE must send `x-csrf-token === principal.csrfToken`, else 403 `csrf_failed`.
    - `viewer` principals get 403 `forbidden` on every write.
    - The result is `request.principal: Principal`.
  - Routes:
    - `POST /v1/auth/login {email, password}` → sets the cookie and returns `{ csrf_token }`. A failure is 401 `unauthorized` with the same message for an unknown email and a wrong password.
    - `POST /v1/auth/logout` deletes the session and clears the cookie.
    - `GET /v1/me` → `{ user: {id,email,name}, workspace: {id,name,role}, csrf_token? }`.
    - `GET /v1/workspace` → `{ id, name, plan, max_cost_per_film_usd, max_cost_per_day_usd }`.
    - `PATCH /v1/workspace` (strict zod: `name` 1–80, caps positive number or null) writes `audit`.
    - `GET /healthz` → `{ ok: true }`.
    - `GET /readyz` → 200 `{ db: 'ok', redis: 'ok' }` or 503 naming the failing part.
  - Wire format: snake_case JSON fields; repositories return camelCase and routes map.
  - `main.ts`: `loadServerConfig(env,'api')`, refuses PGlite (same message as the worker), `createDb`, queues, an event hub (Task 10), listen on `cfg.host:cfg.port`.
  - `dev.ts`: `loadServerConfig(env,'dev')` (PGlite allowed), one `createDb` shared by `buildApp` and `startWorker` in the same process.
  - `scripts/seed.ts`: `npm run seed -- --email <e> --name <n> [--workspace <name>]`, password from `STICK_SEED_PASSWORD`. It creates the user, a workspace with caps 1/10, the owner membership and one channel `{ platform: 'tiktok', display_name: 'TikTok', review_policy: 'manual' }`. If the email already exists it prints `already seeded: <email>` and exits 0.
  - `scripts/create-token.ts`: `npm run token -- --email <e> --name <label>` prints the `stk_…` token once to stdout. An unknown email exits 1.
  - Both scripts use `createDb(cfg)` and `loadDotEnv`. Each must run while `npm run dev` is stopped when on PGlite, and says so in its usage text.
  - `apps/api/test/helpers.ts` → `testApi(): Promise<{ app; db; seeded; jobs: StepJob[]; close }>` uses PGlite, a temp `FsStorage`, the test Redis and an enqueue that records jobs. Tasks 9–10 reuse it.

- [ ] **Step 1: Write failing tests**
  - `auth.test.ts`:
    - `login sets an HttpOnly Secure SameSite=Lax cookie and returns a csrf token`.
    - `wrong password and unknown email give the same 401 body`.
    - `cookie POST without x-csrf-token is 403 csrf_failed; with it, 200`.
    - `bearer POST needs no csrf token`.
    - `revoked token and expired session are 401`.
    - `viewer cannot PATCH /v1/workspace (403)`.
    - `logout ends the session`.
    - `login is rate limited to 10/min per IP`.
    - `logs never contain the bearer token, cookie or password`: capture the pino stream.
  - `foundation.test.ts`:
    - `every response is the envelope with meta.request_id`.
    - `unknown body field is 400 bad_request with issue details`.
    - `a thrown non-API error is 500 internal without stack or message`.
    - `GET /v1/openapi.json lists every /v1 route registered`.
    - `PATCH /v1/workspace sets and clears caps and writes audit_log`.
    - `readyz is 503 naming redis when Redis is down`: use a deps.redis pointed at a closed port.
    - `requests over 120/min per token are 429 rate_limited`.
  - `seed.test.ts`:
    - `seed creates user, workspace, owner, channel; second run says already seeded`.
    - `token prints a stk_ token that authenticates`.
    - `seed without STICK_SEED_PASSWORD exits 1 naming it`.
    - Run on a temp `STICK_PGLITE_DIR`, through `spawnSync(tsx …)` like `make-film.test.ts`.
- [ ] **Step 2: Run the tests.** Run `npx vitest run --project server apps/api && npx vitest run scripts/seed.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the app, plugins, routes and scripts.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): fastify app with envelope, OpenAPI, session+token auth, rate limit, health; seed and token CLIs`.

### Task 9: API resources — channels, characters, assets (signed URLs), review queue, usage

**Files:**
- Create in `apps/api/src`: `routes/channels.ts`, `routes/characters.ts`, `routes/assets.ts`, `routes/review-queue.ts`, `routes/usage.ts`, `signing.ts`
- Test: `apps/api/test/resources.test.ts`, `apps/api/test/assets.test.ts`

**Interfaces:**
- Consumes: the Task 3–4 repos, `FsStorage.localPath`, `testApi`.
- Produces:
  - `signAsset(assetId: string, exp: number, key: string): string` and `verifyAsset(assetId, exp, sig, key, now = Date.now()): boolean`. Verification is timing-safe and false once `exp*1000 < now`.
  - Channels:
    - `GET /v1/channels` (list) and `POST /v1/channels` (`{ display_name 1–80, locale? default 'vi-VN', review_policy?, auto_score_threshold? 0–100 }`; `platform` is always `'tiktok'`).
    - `GET /v1/channels/:id` and `PATCH /v1/channels/:id` (same fields, all optional, strict).
    - No TikTok connect.
  - Characters:
    - `GET /v1/characters` and `POST /v1/characters`, with body `{ name 1–40, look: {ink, hair?}, voice_id ∈ VOICE_IDS, description? ≤ 500 }`. `look` is validated with the screenplay `CastSchema.shape.look` (export it from core as `LookSchema`).
    - `PATCH /v1/characters/:id`.
    - `DELETE /v1/characters/:id` archives and returns 200 with the archived row.
  - Assets:
    - `GET /v1/assets/:id/url` → `{ url, expires_at }`, scoped.
    - `GET /v1/assets/:id/content?exp&sig` is public. It verifies the signature, then streams `storage.localPath(asset.storage_key)` with `reply.sendFile` from `@fastify/static` (`serve: false`, `root: storageDir`). That gives Range/206 and the asset's `mime`. A bad signature is 403 `forbidden`.
  - `GET /v1/review-queue`: films in `awaiting_review` or `qa_failed`, oldest first (`id ASC`, cursor paging). Each item is `{ film: {id,title,status,cost_usd,current_version}, final_asset_id?, contact_asset_id?, findings? }`, where `findings` comes from the gate step's error for `qa_failed`.
  - `GET /v1/usage?from=YYYY-MM-DD&to=YYYY-MM-DD`: defaults to the last 30 UTC days. A range over 366 days, or `from > to`, is 400. Returns `usageSummary` in snake_case.

- [ ] **Step 1: Write failing tests**
  - `resources.test.ts`:
    - `channel CRUD round-trip; unknown review_policy is 400`.
    - `character with a bad ink hex or unknown voice is 400`.
    - `DELETE archives and the list hides it`.
    - `channel and character of another workspace are 404 on get, patch, delete`.
    - `review-queue lists awaiting_review and qa_failed only, oldest first, with findings for qa_failed`: films are set up directly through the repos.
    - `usage groups the seeded usage_events by day, provider and film; a 400-day range is 400`.
  - `assets.test.ts`:
    - `signed url fetches the bytes with the asset mime`.
    - `Range: bytes=0-99 is 206 with 100 bytes`.
    - `asset of another workspace is 404; tampered or expired signature is 403` (Review Focus 3): flip one hex char of `sig`, change `exp`, and use an `exp` in the past.
    - `url route needs auth; content route does not`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the routes and signing.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): channels, characters, signed asset URLs, review queue, usage`.

### Task 10: API films — create, list, detail, redo, cancel, review, screenplay edit, SSE

**Files:**
- Create in `apps/api/src`: `routes/films.ts`, `routes/film-actions.ts`, `routes/film-events.ts`, `events-hub.ts`
- Modify: `apps/api/src/main.ts` and `dev.ts` (create the hub)
- Test: `apps/api/test/films.test.ts`, `apps/api/test/film-events.test.ts`

**Interfaces:**
- Consumes: `createFilm`, `listFilms`, `filmDetail`, `createVersion`, `setFilmStatus`, `insertReview`, `audit`, `parseScreenplay`, `validateScreenplay`, `defaultCatalog`, `storageKey`, `REDOABLE_STATUSES`, `FILM_STEPS`, `filmEventChannel`.
- Produces:
  - `createEventHub(redisUrl): { subscribe(filmId, cb): () => void; close() }`. It holds one ioredis subscriber with `psubscribe('film-events:*')` and fans out in process.
  - `POST /v1/films`:
    - Body `{ channel_id: uuid, title: 1–80, brief?: ≤ 2000 }`, strict. `topic_id` is rejected as an unknown field until topics exist.
    - Optional header `Idempotency-Key`, 1–200 chars.
    - The channel must be in the workspace (404). Then `createFilm`.
    - `created` → 201, plus `enqueue({ step: 'story', … })` and `audit('film.create')`. A replay → 200 with the same film and no enqueue.
  - `GET /v1/films?status=&channel_id=`, cursor paged.
  - `GET /v1/films/:id` → `filmDetail` as `{ film, version: {version, reason, restart_from_step}, steps: [{step,status,attempt,error,started_at,finished_at}], assets: [{id,kind,path,mime,bytes}] }`.
  - `POST /v1/films/:id/redo { from_step ∈ FILM_STEPS, reason 1–500 }` → `createVersion(restartFrom: from_step)`, enqueue `from_step`, 202. A film not in `REDOABLE_STATUSES` → 409 `conflict`.
  - `POST /v1/films/:id/cancel` → `setFilmStatus(cancelled)`. False → 409 `conflict`. Audits. Queued BullMQ jobs then no-op through the worker's cancel check.
  - `POST /v1/films/:id/review { decision: 'approved'|'redo', reason?, redo_from_step? }`:
    - `approved` requires `awaiting_review` (else 409) and sets `approved`.
    - `redo` is allowed from `awaiting_review` or `qa_failed`. It needs `reason` and does `createVersion(restartFrom: redo_from_step ?? 'story')` plus an enqueue.
    - Both insert a `reviews` row for the current version and audit.
  - `PATCH /v1/films/:id/screenplay { screenplay: unknown }`:
    - `parseScreenplay` failing → 422 `invalid_screenplay` with details `{ issues: string[] }`.
    - `validateScreenplay(…, defaultCatalog)` issues → 422 with details `{ issues: Issue[] }`.
    - Otherwise write it to storage under the next version's key, then `createVersion(restartFrom: 'validate', screenplay)`, enqueue `validate`, 202.
    - A film not redoable → 409.
  - `GET /v1/films/:id/events`, SSE:
    - Scoped 404 first. Then headers `content-type: text/event-stream`, `cache-control: no-cache`, `x-accel-buffering: no`.
    - First `event: snapshot` with the detail JSON, then one `event: <e.type>` per hub event.
    - A `: ping` comment every 15 s.
    - Unsubscribe on `request.raw` close.

- [ ] **Step 1: Write failing tests**
  - `films.test.ts`:
    - `POST /v1/films creates a queued film and enqueues story once`.
    - `Idempotency-Key replay returns the same film and enqueues once; a different body is 409` (Review Focus 4).
    - `channel of another workspace is 404`.
    - `film of another workspace is 404 on every film route` (Review Focus 3): GET, events, redo, cancel, review, PATCH screenplay.
    - `cancel a queued film → cancelled; cancel again → 409`.
    - `redo while running is 409; redo after failed creates version 2 restarting at from_step and enqueues it`.
    - `review approve on awaiting_review → approved and a reviews row; approve again → 409`.
    - `review redo on qa_failed creates a new version`.
    - `PATCH screenplay with an unknown action is 422 with the issue; a valid one creates a version restarting at validate whose screenplay asset is the new one`.
    - `list filters by status and pages`.
  - `film-events.test.ts`: `app.listen({ port: 0 })`, then read the stream with `fetch`.
    - `first event is a snapshot`.
    - `a published FilmEvent arrives as an SSE event`: publish with `redisPublisher` from Task 7.
    - `closing the client unsubscribes`: the hub has no callbacks left for that film.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the hub and routes.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): films create/list/detail, redo, cancel, review, screenplay edit, SSE events`.

### Task 11: End-to-end — API → worker → awaiting_review → approve

**Files:**
- Create: `apps/api/test/e2e.test.ts`
- Modify: `.env.example` (final check), `docs/superpowers/plans/2026-11-22-stick-studio-plan-4-backend.md` (tick boxes only)

**Interfaces:**
- Consumes: `buildApp`, `startWorker`, `createQueues`/`enqueueStep`, `redisPublisher`, `createEventHub`, `createTestDb`, `seedWorkspace`, `FsStorage`. They are wired exactly as `dev.ts` does, with `cfg.fake = true`, and share one PGlite instance.

- [x] **Step 1: Write the E2E test.** `api creates a film, the worker makes it with fakes, the owner approves it`:
  1. `POST /v1/films` with the seeded bearer token and channel, title `Phân số là gì?` → 201.
  2. Open `GET /v1/films/:id/events` on a listening app and collect events.
  3. Poll `GET /v1/films/:id` every 500 ms until `awaiting_review`, timeout 280 s.
  4. Expect all 8 steps `succeeded`, with a `final` and a `contact_sheet` asset.
  5. `GET /v1/assets/<final>/url`, then fetch it: 200 and `video/mp4`. Write it to a temp file and `ffprobe`: 1080×1920, with duration within 0.1 s of the timeline's.
  6. The SSE log holds `step succeeded` for each of the 8 steps in `FILM_STEPS` order, then `film awaiting_review`.
  7. `GET /v1/review-queue` contains the film.
  8. `POST /v1/films/:id/review { decision: 'approved' }` → 200. `GET` shows `approved`. `usage_events` has rows for the TTS calls, and `cost_usd` is 0.
- [x] **Step 2: Run it.** Run `npx vitest run --project server apps/api/test/e2e.test.ts`. Expected: PASS. If it fails, fix the owning task's code, not the test.
- [x] **Step 3: Run everything.** Run `npm test && npm run typecheck && npm run coverage:db`. Then run `npx vitest run packages/core packages/pipeline --coverage.enabled --coverage.include='packages/{core,pipeline}/src/**'` and report the numbers. Spec §13 wants 80%; a shortfall is reported, not hidden.
- [x] **Step 4: Smoke-test the dev loop by hand.**
  1. `STICK_URL_SIGNING_KEY=$(openssl rand -hex 32) STICK_FAKE=1 STICK_PGLITE_DIR=out/plan4-smoke/pglite STICK_SEED_PASSWORD=<12+ chars> npm run seed -- --email owner@example.com --name Owner`
  2. `npm run token -- --email owner@example.com --name smoke`
  3. Start `npm run dev` with the same env and Redis running (`redis-server --port 6379 --save ''`).
  4. Create a film with `curl` + bearer, and watch `/v1/films/:id/events` until `awaiting_review`.
  5. Stop dev and delete `out/plan4-smoke`.
- [x] **Step 5: Commit.** Message: `test: end-to-end film through API and worker with fake providers`.

---

## Not in this plan (deliberate)

- **Web UI** (`apps/web`, spec §10): plan 5. The API here is shaped for it: SSE, a review queue, signed URLs.
- **Library workshop** (spec §7.4) and the `library_items`/`library_requests` tables. Library requests from the screenplay step are kept in the screenplay asset's `meta.libraryRequests` and in failed step errors until the table exists.
- **Topics and topic suggestion** (the `topics` table, `/v1/topics*`, and `POST /v1/films {topic_id}`).
- **TikTok publishing**: the `publications` table, `/publish`, `/tiktok/connect|callback`, and `channels.oauth_credentials_encrypted`. `channels.style` and `target_duration_sec` are deferred too.
- **Whisper align** (spec step 5) and **LLM-vision QA with a score** (step 9b). Until a score exists, `auto_if_score` behaves as `manual`.
- **Feeding the characters table into story/screenplay prompts** (spec step 2 "cast"). Characters can be created and edited, but the LLM still invents the cast. The prompt change needs a live LLM to evaluate, and the key is invalid.
- **Gate findings fed back into repair.** A gate failure is `qa_failed` with findings, and the owner redoes the film. Automatic repair is a follow-up.
- **Per-step wall-clock timeouts** for render/ffmpeg in the worker. Only loudnorm pass 1 is bounded (Task 1). A hung ffmpeg holds one render slot until the worker restarts.
- **S3 storage, Docker images, horizontal scaling, role management UI** (P2/P4).
