# Stick Studio Plan 5 — Web UI (`apps/web`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a Vietnamese web UI for the P1 backend: log in, see what is running and what it costs, create a film and watch its steps go live, read and edit the screenplay, inspect QA, redo or cancel, approve or redo films on a phone, manage the cast and the settings. The look follows stick-scene: white paper, black ink, one orange accent, live stick-figure canvases drawn by the same engine code that renders the MP4.

**Architecture:**
- Backend first (Tasks 1–4). The API publishes the film events of its own transitions. A worker sweep fails runs left `running` by a dead worker. A few wire fields the UI needs are added, and the API serves the built SPA same-origin, so the `sid` cookie + `x-csrf-token` model is unchanged.
- Browser-safe engine entry points (Task 5). `@stick/engine/core` builds the rig from source text. `@stick/render/frame` exports `drawFrame` and the timeline helpers without any Node import. The web `<ScenePreview>` draws with exactly these functions on a DOM `<canvas>`; the MP4 path draws with them on `@napi-rs/canvas`.
- `apps/web` (Tasks 6–14) is a Vite + React + TypeScript SPA. TanStack Query holds server data, a small zod/v4-validated client talks to `/v1`, react-router does the routing, and plain CSS uses design-token variables. In dev, Vite proxies `/v1` to the API. In production, Fastify serves `apps/web/dist`.
- Task 15 adds the "Đội sản xuất" floor: a live office scene where one stick-figure teammate per step works in their department's room and carries the file to the next room as real step events arrive.
- Task 16 is a Playwright end-to-end run against the real API + worker with fakes, plus a contract check and axe accessibility checks.

**Tech Stack:** Node 24 ESM, npm workspaces, TypeScript, React 19.3.1, react-dom 19.3.1, react-router 7.13.0, @tanstack/react-query 5.108.2, Vite 8.3.8 (already in the tree via vitest), @vitejs/plugin-react 6.3.0, zod `~3.25.76` (`zod/v4`), vitest 5 + @testing-library/react 16.3.3 + @testing-library/user-event 14.6.13 + @testing-library/jest-dom 8.0.0 + jsdom 31.0.1, @playwright/test 1.65.1, @axe-core/playwright 4.14.0. Fastify 5 + @fastify/static (existing) on the backend.

**Spec:** `docs/superpowers/specs/2026-11-21-stick-studio-design.md`. The sections that bind this plan:
- §10: pages and the shared components `<FilmPlayer>`, `<StepTimeline>`, `<ScenePreview>`, `<CostBadge>`, `<ReviewCard>`.
- §9: API envelope, auth (session cookie `HttpOnly; Secure; SameSite=Lax` + CSRF on writes), Tailscale phone access, `Idempotency-Key`.
- §5 principle "Engine dùng chung cho cả trình duyệt và server".
- §2: one review gate, mobile-first review page, no timeline editor.
- §11: folder layout `apps/web` with `components/` and `lib/api-client.ts`.
- §12: security.

Read with it: [plan 4](2026-11-22-stick-studio-plan-4-backend.md) (API shapes, auth, SSE), [plan 4 follow-ups](2026-11-22-plan-4-followups.md) ("Before plan 5"), and [runbook](../../runbook.md).

### Spec deviations (decided here; the user delegated technical choices)
| Spec | This plan | Why |
|---|---|---|
| §5/§10 Next.js App Router, Server Components | Vite + React SPA, served by the Fastify API | P1 is one user behind Tailscale with no public pages, so there is nothing to server-render. Same origin keeps the cookie + CSRF model with no BFF or CORS. It runs one fewer server process. Next.js can come back in P4 for public pages without touching the API. |
| §5 Tailwind, §15 "shadcn/ui or similar" | Plain CSS with token variables, no component library | The stick-scene look is about 15 tokens and a few pill and button rules. A component kit would mostly be overridden. |
| §10 "client generated from OpenAPI" | A hand-written zod/v4 client, checked by a contract spec | The routes declare no response schemas, so generated types would cover requests only. Parsing responses at the boundary is what catches drift, and `e2e/contract.spec.ts` runs every GET through the web schemas. |
| §10 `<ScenePreview>` wraps `<stick-scene>` | Wraps `drawFrame` from `@stick/render/frame` | The vendored runtime defines no custom element (only its header comment names one). `drawFrame` is the function the MP4 render calls, which is the parity the spec asks for. |
| §10 step bar "chi phí" per step | Film total only | `step_runs` carries no cost, and usage is booked per film. Per-step cost is a follow-up. |
| §10 step bar only | Step bar plus the "Đội sản xuất" floor (Task 15) | The owner approved the office-floor mockup as the way to watch a film being made. The step bar stays the accessible source of truth; the floor is decoration over the same data. |
| §15 system fonts | Be Vietnam Pro (sans) and JetBrains Mono (mono), self-hosted via `@fontsource` | The approved mockups use them, and Be Vietnam Pro covers Vietnamese diacritics cleanly. Self-hosted, so no request leaves the tailnet. |
| §10 `/topics`, `/library`, TikTok connect, voice audition, default voice and style settings | Out of P1 | The API has no topics, library, TikTok or voice-preview endpoints (§14 puts topics and library in P2 and TikTok in P3). The cast form offers the voice id select only. |

## Global Constraints

- **Runtime and packages.** Node 24 ESM, npm workspaces, exact dependency pins (no `^` or `~`, except zod `~3.25.76`, which the graph test enforces). New code imports `zod/v4`.
- **Package graph.** `apps/web` (`@stick/web`) may depend on `@stick/core`, `@stick/engine`, `@stick/library` and `@stick/render`, and never on `@stick/api` or `@stick/worker`, not even as a devDependency (`packages/core/test/graph.test.ts` already allows only `@stick/api -> @stick/worker`). The Playwright harness lives in root `e2e/`, which is not a workspace package, so it may import apps.
- **Browser bundle.** Nothing under `apps/web/src` may reach `node:*`, `@napi-rs/canvas` or `packages/engine/src/rig.ts` / `fonts.ts` at runtime. Only `@stick/engine/core`, `@stick/render/frame`, `@stick/library` and `@stick/core` are imported.
- **Same engine code.** `<ScenePreview>` draws only through `drawFrame(g, timeline, t, rig, defaultCatalog)` from `@stick/render/frame`, with a rig built by `rigFromSource` from the same `packages/engine/src/vendor/stick-rig.js`. No drawing code is copied into the web app.
- **Fonts.** The rig font is `'Balsamiq Sans'`, which maps to `assets/fonts/PatrickHand-Regular.ttf` in the browser too (CSS `@font-face`). Canvases draw only after `document.fonts.load("400 60px 'Balsamiq Sans'")` resolves.
- **Look.** Tokens on `:root` in `apps/web/src/styles/tokens.css`, copied from stick-scene except where AA needs a darker grey:
  `--bg #ffffff`, `--ink oklch(0.2 0 0)`, `--body oklch(0.42 0 0)`, `--muted oklch(0.55 0 0)` (stick-scene uses 0.58, which is 4.3:1 on white and fails AA), `--faint oklch(0.74 0 0)` (decoration and disabled only, never text that must be read), `--line oklch(0.93 0 0)`, `--pill oklch(0.965 0 0)`, `--pill-hover oklch(0.935 0 0)`, `--accent #ff8c26`, `--accent-ink #b45309` (5.0:1 on white; the rig's `C.amber`), `--mono 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`, `--sans 'Be Vietnam Pro', ui-sans-serif, system-ui, -apple-system, sans-serif`, `color-scheme: light`. Fonts come from `@fontsource/be-vietnam-pro` (weights 400, 500, 600) and `@fontsource/jetbrains-mono` (400, 500), imported in `main.tsx`.
- **Mockups.** The approved visual reference is `docs/superpowers/mockups/*.html` (overview, film-detail, review, login, cast, studio-floor). Match their layout, spacing and copy. Where a mockup conflicts with this plan, the plan wins: the film-detail mockup's per-step cost is not built (see deviations), and mockup hex colours map to the tokens above.
  Body text is 15px/1.6 sans, and headings and numbers are mono. Buttons are pills (`border-radius: 99px`, height 36px, 48px on the review bar). The focus ring is `:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px }`.
- **Accent rule.** `--accent` is a fill only. Text on it is `--ink` (7.8:1). Orange text on white uses `--accent-ink`. An accent fill that carries meaning (the cost meter) has a 1px `--ink` outline, which meets non-text contrast 3:1.
- **Light theme only** (stick-scene is light on purpose; dark mode is out of P1).
- **Motion.** Under `prefers-reduced-motion: reduce` nothing autoplays. Canvases show the first frame (t = 0) and play only on an explicit click or Enter, and `<video>` does not autoplay.
- **Copy.** All UI text is Vietnamese and lives in `apps/web/src/i18n/vi.ts`, with the exact labels below. Status labels: queued "Đang chờ", running "Đang chạy", qa_failed "Trượt QA", awaiting_review "Chờ duyệt", approved "Đã duyệt", publishing "Đang đăng", published "Đã đăng", failed "Lỗi", cancelled "Đã huỷ", blocked_budget "Chạm trần chi phí". Step labels: story "Cốt truyện", screenplay "Kịch bản", validate "Kiểm tra", voice "Lồng tiếng", timeline "Dựng nhịp", gate "Cổng QA", render "Render", contact "Contact sheet". Step run statuses: (none) "Chưa chạy", running "Đang chạy", succeeded "Xong", failed "Lỗi", skipped "Bỏ qua".
- **Review quick reasons** (spec §10), mapped to `redo_from_step`: "Sai kiến thức" → `story`, "Cảnh khó hiểu" → `screenplay`, "Giọng" → `voice`, "Nhịp" → `screenplay`, "Khác" → `story`. The sent `reason` is the label, plus `": " + note` when a note is typed (≤ 500 chars total).
- **Rate budget.** The API allows 120 requests/min per session. The web keeps a default `staleTime` of 30 s, caches a signed URL for 10 min (the TTL is 900 s), caches asset JSON by asset id forever, opens at most 3 SSE streams at once (`MAX_LIVE_ON_OVERVIEW = 3`), and never polls faster than every 5 s.
- **No live calls.** Tests use `STICK_FAKE=1`, PGlite and the private `redis-server`. No test reads `.env`.
- **Existing behaviour.** The CLI is unchanged. All existing tests keep passing (1099 passed / 2 skipped before this plan) and `npm run typecheck` stays clean.

## Review Focus

Five conditions the spec implies but does not name, most likely first. Each has a test in the owning task.
1. **Session expired or server restarted while the page is open.** Any 401 sends the user to `/login?next=<current path>` and back after login. It never shows a blank page or a raw JSON error. (Task 7, test `a 401 from any query redirects to /login with next`.)
2. **Page reloaded, so the in-memory CSRF token is gone.** The first write after a reload must still succeed: the token comes from `/v1/me`, and a `403 csrf_failed` refetches `/v1/me` and retries once. (Task 7, test `a csrf_failed write refetches /me and retries once`.)
3. **Signed asset URL expired on a long-open review or detail page** (900 s TTL). A `<video>` or `<img>` error re-requests the URL once and resumes. (Task 9, test `a media error refetches the signed url once`.)
4. **SSE dropped** (laptop sleep, Tailscale reconnect, API restart). EventSource reconnects and the new snapshot replaces the cache. If the stream closes for good, the detail polls every 5 s while the film is `queued` or `running`. (Task 9, tests `a reconnect snapshot replaces the cached detail` and `a closed stream falls back to 5 s polling while the film is live`.)
5. **A review decision races a change made elsewhere** (a redo from another device, or approving a `qa_failed` film). A 409 shows "Phim vừa thay đổi, đã tải lại danh sách" and refetches the queue. `qa_failed` items offer only "Làm lại", because the API approves only `awaiting_review`. (Task 12, tests `a 409 on approve refetches the queue and says so` and `a qa_failed item shows Làm lại but not Duyệt`.)

---

### Task 1: API transitions publish film events; events-hub isolates subscribers

**Files:**
- Modify: `apps/api/src/types.ts`, `apps/api/src/routes/film-actions.ts`, `apps/api/src/routes/films.ts`, `apps/api/src/events-hub.ts`, `apps/api/src/main.ts`, `apps/api/src/dev.ts`
- Modify: `apps/api/test/helpers.ts` (records published events)
- Test: `apps/api/test/films.test.ts`, `apps/api/test/film-events.test.ts`, new `apps/api/test/events-hub.test.ts`

**Interfaces:**
- Produces: `ApiDeps.publish(e: FilmEvent): Promise<void>` (required). `TestApi.events: FilmEvent[]`, and the `TestApiOptions.publish?: ApiDeps['publish']` override.
- Consumes: `redisPublisher(redisUrl, onError)` from `@stick/worker` (already an API dependency) in `main.ts` and `dev.ts`.

- [ ] **Step 1: Write the failing tests** in `films.test.ts`:
  - `cancel publishes a film event with status cancelled`: after `POST /v1/films/:id/cancel`, `t.events` contains `{ type: 'film', filmId, status: 'cancelled' }` (match with `expect.objectContaining`, and `at` is an ISO string).
  - `redo, review redo and a screenplay edit publish status queued; approve publishes approved`: one event per action, `status` respectively `'queued'`, `'queued'`, `'queued'`, `'approved'`.
  - `a keyless create whose enqueue fails publishes status failed`.
  - `a publish failure is logged and the action still succeeds`: `publish` rejects, cancel returns 200, and the log stream has a line with `msg: 'could not publish film event'`.
  - `a rejected transition publishes nothing`: cancel twice; the second is 409, and `t.events` has exactly one event.
  In `events-hub.test.ts`: `one throwing subscriber does not stop the others`: subscribe A (throws) and B on the same film, publish via `redisPublisher`, then B receives the event and `onError` was called once with A's error.
- [ ] **Step 2: Run** `npx vitest run --project server apps/api/test/films.test.ts apps/api/test/events-hub.test.ts`. Expected: FAIL (`t.events` undefined, B never called).
- [ ] **Step 3: Implement.**
  - Add `publish` to `ApiDeps`. Add a local helper `announce(log, publish, filmId, status)` in `film-actions.ts` (exported for `films.ts`). It awaits `publish({ type: 'film', filmId, status, at: new Date().toISOString() })` and catches and logs `'could not publish film event'`. It is best effort because the DB transition is already committed, and SSE clients resync on their next snapshot.
  - Call it after each committed transition: cancel, redo, review approve, review redo, screenplay edit, and the keyless-create failure path. `start()` announces `'failed'` when it fails a film.
  - In `events-hub.ts` wrap each `cb(event)` in its own try/catch that calls `onError`.
  - Wire `redisPublisher(cfg.redisUrl, …)` in `main.ts` and `dev.ts`, and close it in their cleanup.
  - In `helpers.ts`, the default `publish` pushes to `events`.
- [ ] **Step 4: Run** the same command, then `npx vitest run --project server apps/api`. Expected: PASS, and the existing API tests are still green.
- [ ] **Step 5: Commit** `feat(api): publish film events on api transitions; isolate event-hub subscribers`.

### Task 2: Stale-running sweep and a compare-and-set `finishRun`

**Files:**
- Modify: `packages/db/src/repositories/steps.ts`, `apps/worker/src/start.ts`
- Test: `packages/db/test/steps.test.ts`, `apps/worker/test/sweep.test.ts`
- Modify: `docs/runbook.md` ("A stuck film" paragraph)

**Interfaces:**
- Produces:
  - `sweepStaleRuns(db: Db, staleBefore: Date): Promise<SweptRun[]>`, where `SweptRun = { runId: string; workspaceId: string; filmId: string; versionId: string; step: FilmStep; attempt: number; filmFailed: boolean }`.
  - `finishRun` now updates only a row whose status is `running`, and returns `undefined` otherwise.
  - `StartWorkerOptions.sweepEveryMs?: number` (default `SWEEP_EVERY_MS = 60_000`) and `staleAfterMs?: number` (default `STALE_RUN_MS = 30 * 60_000`).
- Consumes: `setFilmStatus(db, ws, filmId, 'failed', expectedVersion)` (a CAS: it fails only a film still at the swept run's version and in a status that can go to `failed`).

- [ ] **Step 1: Write the failing tests.**
  - db: `sweepStaleRuns fails running runs started before the cutoff and the film at that version`. Set up a run started 31 min ago and a film `running`. The result is one `SweptRun` with `filmFailed: true`. The run is `failed` with `error: { code: 'stale', message: 'the worker stopped during this step' }` and `finished_at` set. The film is `failed`.
  - db: `a fresh running run, a succeeded run and a run of an older version are not failed`. The old-version run is swept with `filmFailed: false`, and the film stays at its current status.
  - db: `finishRun on a swept run returns undefined and leaves it failed`.
  - worker: `the sweep runs at start and on its interval and publishes step failed and film failed`. Use `sweepEveryMs: 50` and `staleAfterMs: 0` with a seeded running run. Within 1 s the publisher channel receives `{type:'step', status:'failed'}` then `{type:'film', status:'failed'}`.
- [ ] **Step 2: Run** `npx vitest run packages/db apps/worker/test/sweep.test.ts`. Expected: FAIL (`sweepStaleRuns` is not exported).
- [ ] **Step 3: Implement.**
  - `sweepStaleRuns` runs in one transaction. It does `UPDATE step_runs SET status='failed', error=…, finished_at=now() WHERE status='running' AND started_at < $1 RETURNING`, joins each row to `film_versions` and `films` for `workspaceId`, `filmId` and `version`, then calls `setFilmStatus(tx, …, 'failed', version)`.
  - `finishRun` adds `eq(stepRuns.status, 'running')` to its where clause.
  - `startWorker` runs the sweep once at start, then on `setInterval(…, sweepEveryMs).unref()`, publishes the events, logs errors without crashing, and clears the timer in `close()`. A slow step longer than 30 min would be failed. The worker's existing reload-before-enqueue (F4) then stops the chain, so nothing double-runs. Say this in a one-line comment.
- [ ] **Step 4: Run** the step 2 command, then `npm test`. Expected: PASS, everything green.
- [ ] **Step 5: Update the runbook** "A stuck film" paragraph: the worker fails a step that has been `running` for 30 min, and the film is then redone as before. **Commit** `feat(worker): sweep runs left running by a dead worker; finishRun only finishes running runs`.

### Task 3: Wire fields the UI needs

**Files:**
- Modify: `apps/api/src/signing.ts`, `apps/api/src/routes/assets.ts`, `apps/api/src/routes/films.ts`, `apps/api/src/routes/review-queue.ts`, `apps/api/src/routes/workspace.ts`
- Modify: `packages/db/src/repositories/films.ts`, `packages/db/src/repositories/steps.ts`
- Test: `apps/api/test/films.test.ts`, `apps/api/test/resources.test.ts`, `apps/api/test/assets.test.ts`, `packages/db/test/films.test.ts`, `packages/db/test/steps.test.ts`

**Interfaces:**
- Produces (API):
  - `signedAssetUrl(assetId: string, key: string, nowS = Math.floor(Date.now() / 1000)): { url: string; expires_at: string }` in `signing.ts`. The assets route uses it too.
  - The detail wire `version` gains `id` (the version uuid, needed to match `step` events) and `created_at`.
  - `GET /v1/films` items gain `timeline_url: string | null`, a signed URL of the current version's `timeline` asset.
  - `GET /v1/films/:id/versions` returns `[{ id, version, reason, restart_from_step, created_at }]`, newest first, and 404 for another workspace's film.
  - `GET /v1/review-queue` items gain `final_url`, `contact_url` and `timeline_url` (each `string | null`, signed).
  - `GET`/`PATCH /v1/workspace` gain `effective_max_cost_per_film_usd` and `effective_max_cost_per_day_usd`, each the column or else `cfg.maxCostPerFilmUsd` / `cfg.maxCostPerDayUsd`.
  - `GET /v1/assets/:id/content` gets its own limit `ASSET_CONTENT_RATE_LIMIT = { max: 600, timeWindow: '1 minute' }`, keyed by IP. A `<video>` issues many Range requests, and iOS Safari would exhaust the shared 120/min.
- Produces (db):
  - `currentAssetIds(db, workspaceId, filmIds: string[], kind: AssetKind): Promise<Map<string, string>>`, which returns one query's filmId → assetId for the films' current versions.
  - `listVersions(db, workspaceId, filmId): Promise<FilmVersion[] | undefined>`, which returns `undefined` when the film is not in the workspace.

- [ ] **Step 1: Write the failing tests.**
  - db: `currentAssetIds returns the current version's asset per film and skips films without one and films of another workspace`.
  - db: `listVersions is newest first and undefined for another workspace`.
  - api: `film list items carry a timeline_url that downloads the timeline once it exists, else null`.
  - api: `detail version has id and created_at`.
  - api: `versions lists every version newest first; another workspace's film is 404`.
  - api: `review-queue items carry signed final_url and contact_url`.
  - api: `workspace effective caps fall back to the env defaults when the columns are null` (1 and 10 with the test config).
  - api: `asset content is limited at 600/min per ip, not the shared 120`: 130 sequential signed GETs are all 200 or 206.
- [ ] **Step 2: Run** `npx vitest run packages/db apps/api`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Implement** as specified. Route schemas use `IdParams`. `versions` is registered in `films.ts` with tag `films`.
- [ ] **Step 4: Run** the step 2 command. Expected: PASS. The route-walk auth test now also covers `/v1/films/:id/versions` with 401 (add it to its list if the list is explicit).
- [ ] **Step 5: Commit** `feat(api): version ids and history, signed preview urls in lists, effective caps, asset content limit`.

### Task 4: Serve the built SPA from the API

**Files:**
- Create: `apps/api/src/web.ts`
- Modify: `packages/providers/src/server-config.ts` (`STICK_WEB_DIR`), `apps/api/src/app.ts`, `.env.example`, `docs/runbook.md`
- Test: `apps/api/test/web.test.ts`, `packages/providers/test/server-config.test.ts`

**Interfaces:**
- Produces:
  - `ServerConfig.webDir?: string` (absolute; from `STICK_WEB_DIR`; unset means API only, as today).
  - `resolveWebFile(webDir: string, urlPath: string): { file: string; immutable: boolean } | undefined` in `web.ts`. It is pure apart from one `statSync`.
  - `webFallback(app, webDir)`, which installs the not-found handler.

- [ ] **Step 1: Write the failing tests** (a temp `webDir` with `index.html` and `assets/app-abc123.js`):
  - `GET /films/123 with Accept text/html serves index.html with cache-control no-cache`.
  - `GET /assets/app-abc123.js serves the file with cache-control public, max-age=31536000, immutable`.
  - `GET /v1/nope is still the JSON 404 envelope`, and `GET /healthz` is unchanged.
  - `GET /%2e%2e/package.json and /..%2fpackage.json never leave webDir` (404 envelope or index.html, never the file).
  - `POST /films is the JSON 404 envelope` (the fallback is GET/HEAD only).
  - `the html response has x-frame-options DENY and referrer-policy same-origin`. The first protects the approve button from clickjacking. The second keeps signed URLs out of referrers.
  - `without webDir every unknown path is the JSON 404 envelope`.
  - config: `STICK_WEB_DIR resolves to an absolute path; unset leaves webDir undefined`.
- [ ] **Step 2: Run** `npx vitest run apps/api/test/web.test.ts packages/providers`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `app.ts` the not-found handler becomes: if `cfg.webDir` is set and the method is GET or HEAD and the path starts with neither `/v1/` nor `/healthz` nor `/readyz`, call `resolveWebFile`. If it finds a file, serve it with `reply.sendFile(rel, webDir)`. Otherwise serve `index.html`. Every other request gets the JSON 404.
  - `resolveWebFile` decodes the path, rejects any segment `..`, resolves it under `webDir`, checks `startsWith(webDir + sep)` and that the file exists, and sets `immutable` for paths under `assets/`.
  - The 404 path has no `requireAuth` (it is not a route), so the SPA shell loads without a session. Data stays behind `/v1`.
- [ ] **Step 4: Run** the step 2 command, then `npx vitest run --project server`. Expected: PASS.
- [ ] **Step 5: Document** `STICK_WEB_DIR=apps/web/dist` in `.env.example` and the runbook. **Commit** `feat(api): serve the built web app with an spa fallback that never shadows /v1`.

### Task 5: Browser-safe engine and render entry points

**Files:**
- Create: `packages/engine/src/rig-core.ts`, `packages/render/src/frame.ts`
- Modify: `packages/engine/src/rig.ts`, `packages/engine/src/index.ts`, `packages/engine/package.json` (exports), `packages/render/src/director.ts`, `packages/render/src/captions.ts`, `packages/render/package.json` (exports)
- Modify: render tests that call `drawFrame`, `layoutCaption` or `drawCaption` directly (add `beforeAll(registerFonts)`)
- Test: `packages/engine/test/rig-core.test.ts`, `packages/render/test/frame-browser-safe.test.ts`

**Interfaces:**
- Produces:
  - `rigFromSource(source: string, opts?: { instrument?: boolean }): Rig` in `@stick/engine/core`. This is the current `loadRig` body minus the file read. `loadRig` (Node) becomes `rigFromSource(readFileSync(VENDOR, 'utf8'), opts)`.
  - Engine exports: `"./core": "./src/rig-core.ts"` and `"./vendor/stick-rig.js": "./src/vendor/stick-rig.js"`.
  - Render export `"./frame": "./src/frame.ts"`, which re-exports `drawFrame`, `sceneStateAt`, `soloTimeline`, `FRAME`, `STAGE` and `cameraShift` only.
  - `drawFrame` and the caption layout no longer call `registerFonts()`. `renderVideo` and `renderContactSheet` already do, and they stay the only Node entry points that draw.

- [ ] **Step 1: Write the failing tests.**
  - `rigFromSource builds the same rig as loadRig`: same `Object.keys`, and `fig` exists. `instrument: true` still throws `rig: cannot instrument fig()` on source without the hook.
  - `render/frame reaches no node-only module`: start at `packages/render/src/frame.ts`, follow every non-`import type` import (relative files and `@stick/*` package entry files, resolved through each package's `exports`), and assert that no visited specifier is `node:*`, `@napi-rs/canvas`, `@stick/engine` (root), `packages/engine/src/rig.ts` or `packages/engine/src/fonts.ts`. A regex over source text, like the graph test, is enough.
- [ ] **Step 2: Run** `npx vitest run packages/engine packages/render`. Expected: FAIL (no `rig-core`, and `director.ts` imports `registerFonts` from `@stick/engine`).
- [ ] **Step 3: Implement.** `director.ts` and `captions.ts` import only `type Rig` from `@stick/engine`. Remove their `registerFonts()` calls, and add `beforeAll(() => registerFonts())` to every render test that draws without going through `renderVideo` or `renderContactSheet`.
- [ ] **Step 4: Run** `npm test`. Expected: PASS, with the golden and frame tests unchanged. A font regression would show up there as pixel drift, and a drift is a FAIL, not a re-bless.
- [ ] **Step 5: Commit** `refactor(engine,render): browser-safe rig-core and render/frame entry points`.

### Task 6: `apps/web` scaffold, tokens, shell and routing

**Files:**
- Create: `apps/web/package.json`, `apps/web/index.html`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/styles/tokens.css`, `apps/web/src/styles/base.css`, `apps/web/src/i18n/vi.ts`, `apps/web/src/components/Layout.tsx`, `apps/web/src/pages/NotFound.tsx`, `apps/web/src/vite-env.d.ts`, `apps/web/test/setup.ts`, `apps/web/test/layout.test.tsx`
- Modify: `vitest.config.ts` (a `web` project; the `server` project excludes `apps/web/**`), `tsconfig.base.json` (`exclude: ["apps/web"]`; `include` adds `e2e`, `playwright.config.ts`), root `package.json` scripts

**Interfaces:**
- Produces:
  - `@stick/web` dependencies (exact): `@stick/core`, `@stick/engine`, `@stick/library`, `@stick/render` (all `0.0.0`), `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `zod ~3.25.76`. devDependencies: `vite 8.3.8`, `@vitejs/plugin-react 6.3.0`, `@types/react 19.3.0`, `@types/react-dom 19.3.0`, plus dependencies `@fontsource/be-vietnam-pro` and `@fontsource/jetbrains-mono`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `@napi-rs/canvas` (same version as engine; tests only). Before pinning, verify every version with `npm view <pkg>@<v> version` and record any substitution in the commit message.
  - Scripts:
    - web: `dev` (vite, port 5173), `build` (`vite build`, out `dist`), `preview`.
    - root: `"web": "npm run dev -w @stick/web"`, `"web:build": "npm run build -w @stick/web"`, `"test:e2e:web": "npm run web:build && playwright test"`, and `typecheck` becomes `tsc -p tsconfig.base.json --noEmit && tsc -p apps/web/tsconfig.json --noEmit`.
  - `vite.config.ts`: `server.proxy = { '/v1': { target: process.env.STICK_API_URL ?? 'http://127.0.0.1:3000' } }`, the react plugin, `build.outDir 'dist'`, `server.fs.allow` including the repo root (fonts live in `/assets`).
  - The vitest `web` project: `{ extends: 'apps/web/vite.config.ts', test: { name: 'web', root: 'apps/web', environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'], setupFiles: ['test/setup.ts'] } }`.
  - `tsconfig.json` extends the base with `jsx: 'react-jsx'`, `lib: ['ES2023', 'DOM', 'DOM.Iterable']`, `types: ['vite/client']` and `include: ['src', 'test']`. `vite-env.d.ts` declares `*?raw` (string) and `*?url` (string).
  - Routes in `app.tsx` (`createBrowserRouter`): `/login` is public. Everything else sits under `<RequireAuth><Layout/></RequireAuth>`: `/`, `/films`, `/films/:id`, `/review`, `/cast`, `/settings`, and `*` → `NotFound`. Pages are stubs until their tasks land.
  - `Layout`: a top nav at ≥ 720px and a bottom tab bar below it, with the items "Tổng quan", "Phim", "Duyệt", "Nhân vật", "Cài đặt" and an "Đăng xuất" button. The active item gets `aria-current="page"`. On `/review` at < 720px the tab bar is hidden and a "Đóng" link (×) returns to `/`.
  - `tokens.css` holds the Global Constraints tokens verbatim, plus `@font-face { font-family: 'Balsamiq Sans'; src: url(<PatrickHand-Regular.ttf imported with ?url>) }`, injected from `main.tsx`.
  - `<html lang="vi">`.

- [ ] **Step 1: Write the failing test** `layout.test.tsx`: `layout shows the five Vietnamese nav items and marks the current one`. Render at `/films` in a `MemoryRouter`: there are 5 links with the exact labels, "Phim" has `aria-current="page"`, and the "Đăng xuất" button is present.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL (no project or module).
- [ ] **Step 3: Implement** the scaffold above, then `npm install`.
- [ ] **Step 4: Run** `npx vitest run --project web`, `npm run web:build` and `npm run typecheck`. Expected: PASS, `apps/web/dist/index.html` exists, and the typecheck is clean. Also run `npx vitest run packages/core/test/graph.test.ts`: PASS (web pins zod, and there are no app edges).
- [ ] **Step 5: Commit** `feat(web): vite react scaffold, stick-scene tokens, vietnamese shell and routes`.

### Task 7: API client, auth and login

**Files:**
- Create: `apps/web/src/api/client.ts`, `apps/web/src/api/schemas.ts`, `apps/web/src/api/queries.ts`, `apps/web/src/api/query-client.ts`, `apps/web/src/components/RequireAuth.tsx`, `apps/web/src/components/ErrorNotice.tsx`, `apps/web/src/pages/Login.tsx`
- Test: `apps/web/test/client.test.ts`, `apps/web/test/login.test.tsx`, `apps/web/test/require-auth.test.tsx`

**Interfaces:**
- Produces:
  - `class ApiError extends Error { status: number; code: string; details: unknown }`. Codes are the API's codes plus the client-only `'network'` and `'parse'`.
  - `apiFetch<T>(path: string, schema: z.ZodType<T>, init?: { method?: 'GET'|'POST'|'PATCH'|'DELETE'; body?: unknown; headers?: Record<string,string> }): Promise<{ data: T; meta: Record<string, unknown> }>`. It is same-origin with `credentials: 'same-origin'`. A write sends `content-type: application/json` (only with a body) and `x-csrf-token`. It parses the envelope and then `data` with `schema`, and throws `ApiError` for an error envelope, `'network'` on a fetch rejection and `'parse'` on a schema mismatch.
  - `setCsrfToken(t: string | null): void` and `getCsrfToken(): string | null` (module memory, never `localStorage`).
  - Schemas in `schemas.ts` mirror the API's `toWire` functions exactly: `Me`, `Workspace` (with the effective caps), `Channel`, `Character`, `Film`, `FilmListItem` (`Film` plus `timeline_url`), `FilmDetail` (`{ film, version: { id, version, reason, restart_from_step, created_at }, steps, assets }`), `Version`, `ReviewItem`, `Usage`, `AssetUrl`, and `FilmEvent` (a `step | film` discriminated union on `type`).
  - Hooks in `queries.ts` (keys in brackets): `useMe()` [`['me']`], `useWorkspace()` [`['workspace']`], `useChannels()` [`['channels']`], `useCharacters()` [`['characters']`], `useFilms(filter)` [`['films', filter]`], `useFilm(id)` [`['film', id]`], `useVersions(id)` [`['film', id, 'versions']`], `useReviewQueue()` [`['review-queue']`], `useUsageToday()` [`['usage', today]`], `useAssetUrl(id)` [`['asset-url', id]`, staleTime 10 min], `useAssetJson(id, schema)` [`['asset-json', id]`, staleTime Infinity], and mutation hooks named `useCreateFilm`, `useCancelFilm`, `useRedoFilm`, `useReviewFilm`, `useEditScreenplay`, `useSaveCharacter`, `useArchiveCharacter`, `useSaveChannel`, `useSaveWorkspace`, `useLogin`, `useLogout`. Each mutation invalidates the keys it changes.
  - `useMe` success calls `setCsrfToken(me.csrf_token ?? null)`.
  - `createQueryClient(onUnauthorized: () => void)`: defaults `staleTime 30_000` and `retry` (only `'network'`, at most 2). A `QueryCache` and `MutationCache` `onError` call `onUnauthorized` on a 401.
  - `RequireAuth` renders children when `useMe` succeeds, shows `<p aria-busy="true">Đang tải…</p>` while loading (Task 8 swaps in `<StickState kind="rendering">`), and redirects to `/login?next=…` on a 401.
  - `ErrorNotice({ error })` maps codes to Vietnamese: `network` "Mất kết nối tới máy chủ", `parse` "Phản hồi không đúng định dạng", `forbidden` "Bạn không có quyền làm việc này", `not_found` "Không tìm thấy", `conflict` "Phim vừa thay đổi, hãy tải lại", `rate_limited` "Thao tác quá nhanh, thử lại sau {retry_after_s} giây", `bad_request` "Dữ liệu không hợp lệ" plus a details list, `internal` "Máy chủ gặp lỗi". The container has `role="alert"`.
- Consumes: Task 3's wire fields.

- [ ] **Step 1: Write the failing tests** (`fetch` stubbed with `vi.fn`):
  - `apiFetch parses data and returns meta`, and `an error envelope throws ApiError with status, code and details`.
  - `a body that does not match the schema throws code parse`, and `a fetch rejection throws code network`.
  - `writes send x-csrf-token and json content-type; GETs send neither`.
  - `a csrf_failed write refetches /me and retries once`: the first POST → 403 `csrf_failed`, `/v1/me` → `csrf_token: 'b'`, and the second POST carries `x-csrf-token: b` and succeeds. A second `csrf_failed` is thrown, not retried again.
  - `a 401 from any query redirects to /login with next`: render `/films` with `/v1/films` → 401, and the location becomes `/login?next=%2Ffilms`.
  - login: `wrong credentials show Sai email hoặc mật khẩu`, `429 shows the retry seconds`, `500 shows Đăng nhập tạm thời không dùng được`, `success stores the csrf token and navigates to next`. Also `a next of //evil.example or https://evil.example navigates to /`: only a path that starts with one `/` is followed.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement.** The login form has labelled inputs "Email" (`type=email`, `autocomplete=username`) and "Mật khẩu" (`type=password`, `autocomplete=current-password`) and a submit button "Đăng nhập", disabled while pending. Logout calls `POST /v1/auth/logout`, then `setCsrfToken(null)`, then `queryClient.clear()`, then navigates to `/login`.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): zod-validated api client, csrf handling, login and auth guard`.

### Task 8: Live stick canvases — `<ScenePreview>` and `<StickState>`

**Files:**
- Create: `apps/web/src/stick/rig.ts`, `apps/web/src/stick/timelines.ts`, `apps/web/src/stick/scene-player.ts`, `apps/web/src/stick/ScenePreview.tsx`, `apps/web/src/stick/StickState.tsx`, `apps/web/src/stick/use-reduced-motion.ts`
- Test: `apps/web/test/scene-player.test.ts`, `apps/web/test/timelines.test.ts`, `apps/web/test/scene-preview.test.tsx`

**Interfaces:**
- Consumes: `rigFromSource` (`@stick/engine/core`), the vendor source via `import src from '@stick/engine/vendor/stick-rig.js?raw'`, `drawFrame`, `soloTimeline` and `FRAME` (`@stick/render/frame`), `defaultCatalog` (`@stick/library`), and `type Timeline` (`@stick/core`).
- Produces:
  - `rig: Rig`, one shared instance (`drawFrame` resets `setSettle(1)` every frame), and `fontsReady(): Promise<void>`, which resolves at once when `document.fonts` is absent (jsdom).
  - `openingScene(tl: Timeline): Timeline`: scene 0 only, with `duration = scenes[0].end`.
  - `idleTimeline(tl: Timeline): Timeline`: scene 0 with its props, backdrop and start marks, and one beat of `IDLE_LOOP_S = 8` seconds. In it, every cast member in `start_marks` does `look_around` from `GLANCE_AT_S = 5` to `GLANCE_END_S = 6.5`, with no lines. Breathing comes from the rest pose.
  - `castTimeline(look: { ink: string; hair?: Hair }): Timeline`: `soloTimeline('wave', 2, undefined, undefined, look.ink)`, with the cast look replaced by `look`.
  - `STICK_STATES: Record<'empty' | 'rendering' | 'error' | 'done', Timeline>`:
    - empty: `soloTimeline('shrug', 2)`
    - rendering: `soloTimeline('type_laptop', 3, 'near:desk', 'desk')`
    - error: `soloTimeline('facepalm', 2)`
    - done: `soloTimeline('cheer', 2)`
  - `createScenePlayer(o: { actionDuration: number; idleDuration: number; reducedMotion: boolean })`. It returns `{ frame(nowMs: number): { which: 'idle' | 'action'; t: number }; play(nowMs: number): void; looping(): boolean }`.
    - idle: `t = ((now - since) / 1000) % idleDuration`.
    - `play` starts the action at t = 0. When the action passes `actionDuration` the player returns to idle with t restarting at 0.
    - Reduced motion: `frame` is `{ which: 'action', t: 0 }` until `play`, and `looping()` is false when not playing.
  - `<ScenePreview timeline idle? trigger label interactive? />`. Props: `timeline: Timeline`, `idle?: Timeline` (defaults to `idleTimeline(timeline)`), `trigger: 'hover' | 'view' | 'none'`, `label: string`, `interactive?: boolean` (default true; false inside a link).
    - The canvas has `role="img"` and `aria-label={label}`, a 9:16 aspect, and a backing size of css size × `devicePixelRatio`, scaled to `FRAME`.
    - One rAF loop runs at most 30 fps, only while the canvas is intersecting (IntersectionObserver), and stops when it is offscreen or unmounted.
    - `play()` fires on `pointerenter` for `'hover'`, on the first intersection for `'view'`, and on click or Enter or Space always when `interactive` (the canvas then gets `tabIndex=0`).
    - A drawing error stops the loop and shows nothing worse than a blank paper canvas, and is reported once with `console.warn` together with the timeline title.
  - `<StickState kind label />`: a `ScenePreview` of `STICK_STATES[kind]` with `trigger='view'`, the idle being the action itself looped, and a mono caption `label` under it.

- [ ] **Step 1: Write the failing tests.**
  - `idle frames loop over idleDuration`: with `idleDuration 8`, now = 9000 gives t = 1.
  - `play runs the action once then returns to idle at t 0`.
  - `reduced motion shows the first action frame and does not loop until played`.
  - `idleTimeline keeps scene 0's backdrop, props and marks and glances from 5 to 6.5 s with no lines`.
  - `openingScene keeps only scene 0`.
  - `every stick state and castTimeline draw at start, middle and end without throwing`, using `createCanvas(1080, 1920)` from `@napi-rs/canvas`, `registerFonts()` and the Node `loadRig()`. This proves the timelines are valid for the engine. The browser path is proven in Task 16.
  - `every action the web timelines use exists in defaultCatalog`: `wave`, `shrug`, `type_laptop`, `facepalm`, `cheer` and `look_around`.
  - `ScenePreview calls drawFrame from @stick/render/frame with the rig and defaultCatalog`: `vi.mock('@stick/render/frame', …)` spies on it, `getContext` is stubbed with a recording object, and fake rAF is advanced one frame.
  - `ScenePreview plays on pointerenter when trigger is hover`.
  - `ScenePreview does not start a loop under reduced motion`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces. `use-reduced-motion.ts` wraps `matchMedia('(prefers-reduced-motion: reduce)')` with a change listener.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): live stick canvases drawn by the render engine, idle and play, reduced motion`.

### Task 9: Live film data — SSE, `<StepTimeline>`, `<FilmPlayer>`, `<CostBadge>`

**Files:**
- Create: `apps/web/src/api/events.ts`, `apps/web/src/components/StepTimeline.tsx`, `apps/web/src/components/FilmPlayer.tsx`, `apps/web/src/components/CostBadge.tsx`, `apps/web/src/components/StatusPill.tsx`, `apps/web/src/components/AssetImage.tsx`
- Test: `apps/web/test/events.test.ts`, `apps/web/test/step-timeline.test.tsx`, `apps/web/test/film-player.test.tsx`, `apps/web/test/cost-badge.test.tsx`

**Interfaces:**
- Consumes: the `FilmDetail` and `FilmEvent` schemas, and `useFilm` and `useAssetUrl` from Task 7.
- Produces:
  - `applyFilmEvent(detail: FilmDetail, e: FilmEvent): FilmDetail`. It is pure. A `step` event whose `versionId` is not `detail.version.id` returns `detail` unchanged. A `step` event upserts that step's `status` and `attempt`, sets `started_at = at` when running and `finished_at = at` when it is succeeded, failed or skipped, and keeps `FILM_STEPS` order. A `film` event sets `film.status`.
  - `useFilmEvents(filmId: string): { live: 'connecting' | 'live' | 'offline' }`. It opens `new EventSource('/v1/films/' + id + '/events')`.
    - `snapshot` → `setQueryData(['film', id], FilmDetail.parse(data))` and `live`.
    - `step` → `setQueryData(applyFilmEvent)`. On `succeeded` or `failed` it also invalidates `['film', id]`, because new assets have no event.
    - `film` → `setQueryData`, then invalidate `['film', id]`, `['film', id, 'versions']`, `['films']` and `['review-queue']`.
    - `onerror` with `readyState === CLOSED` → `offline`. The stream closes on unmount.
  - `useFilm(id)` uses `refetchInterval: 5000` only while `live === 'offline'` and the status is `queued` or `running`.
  - `<StatusPill status />`: a pill with the Vietnamese label. Running gets a small accent dot with an ink outline. The text stays ink.
  - `<StepTimeline steps />`: an ordered list of the 8 steps (`data-step`, `data-status`), each with its label, status text, attempt when > 1, and duration in seconds (one decimal) when finished.
    - A failed step shows `error.message`.
    - `code: 'budget'` shows "Chạm trần {scope === 'film' ? 'mỗi phim' : 'mỗi ngày'}: đã tiêu ${spentUsd} / ${capUsd}".
    - A gate failure shows "{n} cảnh báo QA".
    - A `running` step has `aria-current="step"`, and the list has `aria-live="polite"`.
  - `<FilmPlayer assetId? src? onExpired? autoPlay? />` (`assetId?: string | null`, `src?: string | null` for an already-signed URL, `onExpired?: () => void`). Without either it shows `<StickState kind="rendering" label="Đang làm phim…">`. Otherwise it shows `<video controls playsInline preload="metadata">` in a 9:16 box. With `autoPlay` and no reduced motion it adds `autoPlay muted loop` and an "Bật tiếng" button.
  - `<AssetImage assetId alt />` is the same idea for the contact sheet.
  - Both resolve `assetId` with `useAssetUrl(assetId)`. On a media `error` they call `refetch()` once per URL (or `onExpired()` when given `src`), then show `ErrorNotice`.
  - `<CostBadge spentUsd capUsd label />`: mono "$0.42 / $10.00" and a `role="meter"` bar with `aria-valuemin=0`, `aria-valuemax=cap`, `aria-valuenow=spent` and `aria-label=label`, all with a 1px ink outline.
    - `state = spent >= cap ? 'over' : spent >= 0.8 * cap ? 'warn' : 'ok'` (`WARN_AT = 0.8`).
    - The fill is `--ink` for ok, `--accent` for warn and `--ink` plus the text "Đã chạm trần" for over.
    - Dollars are formatted with two decimals, or four below $0.01 (`FINE_BELOW_USD = 0.01`).

- [ ] **Step 1: Write the failing tests.**
  - events: `a step event for another version leaves the detail unchanged`, `a running then succeeded step event sets started_at and finished_at`, `a film event sets the status`.
  - events, with a fake `EventSource` class on `globalThis`:
    - `a reconnect snapshot replaces the cached detail`
    - `a film event invalidates detail, versions, films and review-queue`
    - `a closed stream falls back to 5 s polling while the film is live`: offline plus `running` gives `refetchInterval` 5000, and `awaiting_review` gives false.
  - step-timeline: `lists the 8 steps in order with Vietnamese labels and Chưa chạy for missing runs`, `a budget failure shows the cap message`, `a running step is aria-current`.
  - film-player: `no asset shows the rendering stick state`, `a media error refetches the signed url once`, `reduced motion never sets autoplay`.
  - cost-badge: `0.42 of 10 is ok and reads $0.42 / $10.00`, `8 of 10 is warn`, `10 of 10 is over and says Đã chạm trần`, `0.004 reads $0.0040`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): live step timeline over sse with polling fallback, film player, cost badge`.

### Task 10: Overview `/` and films `/films`

**Files:**
- Create: `apps/web/src/pages/Overview.tsx`, `apps/web/src/pages/Films.tsx`, `apps/web/src/components/FilmCard.tsx`, `apps/web/src/components/NewFilmForm.tsx`
- Test: `apps/web/test/overview.test.tsx`, `apps/web/test/films.test.tsx`

**Interfaces:**
- Consumes: `useFilms`, `useReviewQueue`, `useUsageToday`, `useWorkspace`, `useChannels`, `useCreateFilm`, `useFilmEvents`, `StepTimeline`, `CostBadge`, `ScenePreview` and `StickState`.
- Produces:
  - `<FilmCard film: FilmListItem />`: a link to `/films/:id`. It shows the title (one line, ellipsis), `StatusPill`, the cost, and a `ScenePreview` of the film's opening scene once `timeline_url` resolves.
    - The preview is fetched with `useQuery(['timeline', url])` → `fetch(url).json()`. It is cached forever and parsed as `Timeline` with a light `z.custom`, because the engine trusts the worker's output.
    - The canvas is `aria-hidden` and `interactive={false}`.
    - `trigger` is `'hover'` on `(pointer: fine)` and `'view'` on `(pointer: coarse)`.
    - Without a timeline it shows an empty paper card of the same size, so the layout does not jump.
  - Overview sections:
    - "Đang chạy": `useFilms({ status: 'running' })` plus `{ status: 'queued' }`. Each of the first `MAX_LIVE_ON_OVERVIEW = 3` gets `useFilmEvents` and a compact `StepTimeline`, and a "Xem tất cả" link goes to `/films?status=running`.
    - "Chờ duyệt": a count from `useReviewQueue` (shown as "20+" when `next_cursor` is set), a link to `/review`, and the first 3 `FilmCard`s.
    - "Chi phí hôm nay": `CostBadge` of `usage.total_usd` against `workspace.effective_max_cost_per_day_usd`.
    - Empty states: `<StickState kind="empty" label="Chưa có phim nào đang chạy">`.
  - Films page:
    - Status filter pills ("Tất cả" plus the 10 status labels, `aria-pressed`) synced to `?status=`.
    - A grid of `FilmCard`s: 3 columns at ≥ 720px, 2 below.
    - Cursor paging with a "Xem thêm" button.
    - A "Phim mới" button opens `NewFilmForm` in a `<dialog>`.
  - `NewFilmForm` fields:
    - "Kênh": a select, prefilled when there is one channel.
    - "Tiêu đề": required, 1–80 chars, with a counter.
    - "Mô tả ngắn": optional, ≤ 2000 chars.
    - On submit it sends `Idempotency-Key: crypto.randomUUID()`, generated once per opened form and reused on retry. Success navigates to `/films/:id`. A 400 shows the details list.

- [ ] **Step 1: Write the failing tests.**
  - `overview shows running films with live steps, the review count and today's cost against the effective cap`.
  - `overview opens at most 3 event streams`: with 5 running films the fake EventSource count is 3.
  - `review count shows 20+ when there is a next page`.
  - `films filter pills set ?status and refetch`.
  - `a film card with a timeline_url draws a preview; without one it keeps the card size`.
  - `new film sends one Idempotency-Key per form, reused on retry after a network error`.
  - `a successful create navigates to the film`.
  - `an 81-character title is blocked client-side with the counter in error`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): overview with live runs and today's cost, films list with live cards and new film`.

### Task 11: Film detail `/films/:id`

**Files:**
- Create: `apps/web/src/pages/FilmDetail.tsx`, `apps/web/src/pages/film/ScreenplayTab.tsx`, `apps/web/src/pages/film/StoryView.tsx`, `apps/web/src/pages/film/QaTab.tsx`, `apps/web/src/pages/film/VersionsTab.tsx`, `apps/web/src/pages/film/FilmActions.tsx`, `apps/web/src/components/IssueList.tsx`
- Test: `apps/web/test/film-detail.test.tsx`, `apps/web/test/screenplay-tab.test.tsx`

**Interfaces:**
- Consumes: `useFilm`, `useFilmEvents`, `useVersions`, `useAssetJson`, `useCancelFilm`, `useRedoFilm`, `useEditScreenplay`, `FilmPlayer`, `AssetImage`, `StepTimeline`, `StatusPill`, `ErrorNotice`, plus `parseScreenplay`, `FILM_STEPS` and `REDOABLE_STATUSES` from `@stick/core`.
- Produces:
  - Page layout: on the left (top on mobile) a `FilmPlayer` of the `final` asset. On the right, the title, `StatusPill`, cost, version "v{n}" and reason, `StepTimeline`, and `FilmActions`. Below, tabs with `role="tablist"` and arrow-key navigation: "Kịch bản", "QA", "Phiên bản". When `awaiting_review` or `qa_failed`, a link "Duyệt phim này" goes to `/review?film=:id`.
  - `FilmActions`:
    - "Huỷ" is shown for `queued` or `running`, after a `confirm` dialog "Huỷ phim này?".
    - "Làm lại" is shown for `REDOABLE_STATUSES` and opens a dialog with "Làm lại từ bước" (a select of the 8 step labels, default `story`) and "Lý do" (required, ≤ 500 chars).
    - A 409 shows the `conflict` notice and refetches.
  - `ScreenplayTab`:
    - Read: `StoryView` of the `story` asset (title, logline, genre, hook, and the lines per scene as "{name}: {line}").
    - Edit, enabled only for `REDOABLE_STATUSES`, otherwise disabled with the hint "Chỉ sửa được khi phim đã dừng".
      - Lines mode: one `<textarea maxLength=160>` per beat with `say`, labelled "Cảnh {i} · {cast name}".
      - "Sửa JSON" mode: one textarea holding the whole screenplay, pretty-printed.
    - "Lưu" first runs a client-side `JSON.parse` (an invalid one shows "JSON không hợp lệ: {message}" and sends nothing), then `PATCH /v1/films/:id/screenplay { screenplay }`.
    - A 422 `invalid_screenplay` renders `IssueList` of `details.issues` (`code`, `path`, `message`, `key`) in `role="alert"`, and the edits are kept.
    - A 202 shows "Đã lưu, phim đang chạy lại từ bước Kiểm tra" and the detail refetches (the version changes).
  - `QaTab`: the score `film.qa_score` (or "—"), the `contact_sheet` via `AssetImage` with alt "Contact sheet các cảnh", and the findings. The findings are the gate step's `error.details.findings` when it failed, else the `qa_report` asset's `findings`, as a list of strings. With none it shows "Không có cảnh báo".
  - `VersionsTab`: `useVersions`, newest first, showing "v{n}", the reason, "làm lại từ {step label}" and the local date and time. The current version is marked "hiện tại".

- [ ] **Step 1: Write the failing tests.**
  - `detail shows player, status, version and the live step timeline`: the fake EventSource sends a snapshot, then a `step` running event, and the "Cốt truyện" row reads "Đang chạy".
  - `Huỷ appears only while queued or running and posts cancel after confirm`.
  - `Làm lại requires a reason and posts from_step and reason`.
  - `a 409 on redo shows the conflict notice`.
  - screenplay: `editing a line and saving sends the full screenplay with only that text changed`.
  - screenplay: `invalid JSON is caught before sending`.
  - screenplay: `a 422 lists each issue and keeps the edits`.
  - screenplay: `editing is disabled while running with the hint`.
  - qa: `qa_failed shows the gate findings; a passed gate with no findings says Không có cảnh báo`.
  - versions: `versions are newest first and the current one is marked`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): film detail with live steps, screenplay edit with issues, qa, versions, redo and cancel`.

### Task 12: Review `/review` (mobile-first) and `<ReviewCard>`

**Files:**
- Create: `apps/web/src/pages/Review.tsx`, `apps/web/src/components/ReviewCard.tsx`, `apps/web/src/components/swipe.ts`
- Test: `apps/web/test/review.test.tsx`, `apps/web/test/swipe.test.ts`

**Interfaces:**
- Consumes: `useReviewQueue`, `useReviewFilm`, `FilmPlayer` (given the signed `final_url` as `src` with `onExpired`, so no extra URL request is needed), `StickState` and `ErrorNotice`.
- Produces:
  - `swipeDirection(dx: number, dy: number): 'next' | 'prev' | null`. It returns `'next'` when `dx <= -SWIPE_MIN_PX` and `|dx| > 1.5 * |dy|`, and `'prev'` for the mirror case (`SWIPE_MIN_PX = 60`).
  - `<ReviewCard item onApprove onRedo busy />`:
    - Full-height (`100dvh`) vertical video with `autoPlay` (respecting reduced motion).
    - The title overlaid at the top.
    - A `qa_failed` banner "Trượt QA · {n} cảnh báo" with the findings in a `<details>`.
    - A bottom bar of two 48px pill buttons: "Duyệt" (accent fill, ink text), absent for `qa_failed`, and "Làm lại" (pill fill).
    - "Làm lại" opens a sheet with the 5 quick-reason chips (`aria-pressed`, exactly one required), an optional "Ghi chú" textarea and "Gửi". The body is `{ decision: 'redo', reason, redo_from_step }` per the Global Constraints mapping.
  - `Review` page:
    - Holds an index into the queue items. `?film=<id>` starts at that film when it is present.
    - Shows a "{i}/{n}" counter.
    - Swiping or the "‹ Trước" / "Tiếp ›" buttons move between items without deciding.
    - After a successful decision the item is removed from the cached queue and the next one shows.
    - When the queue is empty it shows `<StickState kind="done" label="Hết phim chờ duyệt">`.
    - When `final_url` is null (still rendering) it shows the rendering stick state.
    - On a 409 it shows "Phim vừa thay đổi, đã tải lại danh sách" and refetches the queue.
    - On an expired URL (`onExpired`) it refetches the queue, since its URLs are signed at list time.

- [ ] **Step 1: Write the failing tests.**
  - swipe: `-80,10 is next; 80,10 is prev; -40,0 and -80,100 are null`.
  - `approve posts decision approved and shows the next film`.
  - `Làm lại needs one quick reason and posts the mapped step: Giọng → voice with reason Giọng: <note>`.
  - `a qa_failed item shows Làm lại but not Duyệt`.
  - `a 409 on approve refetches the queue and says so`.
  - `an empty queue shows Hết phim chờ duyệt`.
  - `?film= starts at that film`.
  - `buttons are reachable by Tab in the order video controls, Duyệt, Làm lại`.
  - `the Duyệt and Làm lại buttons have accessible names and are at least 48px tall`: check the computed style `min-height: 48px`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces. Pointer events on the video wrapper feed `swipeDirection` on `pointerup`, with `touch-action: pan-y`.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): mobile-first review page with quick reasons and swipe`.

### Task 13: Cast `/cast` with live engine preview

**Files:**
- Create: `apps/web/src/pages/Cast.tsx`, `apps/web/src/components/CharacterForm.tsx`
- Test: `apps/web/test/cast.test.tsx`

**Interfaces:**
- Consumes: `useCharacters`, `useSaveCharacter`, `useArchiveCharacter`, `useMe` (role), `castTimeline`, `ScenePreview`, and `VOICE_IDS` and `HAIR_STYLES` from `@stick/core`.
- Produces:
  - A grid of character cards, each showing `ScenePreview` of `castTimeline(look)` with `trigger='hover'`, the name, the voice label and the description.
  - "Thêm nhân vật" and "Sửa" open `CharacterForm` in a `<dialog>`:
    - "Tên": 1–40 chars.
    - "Màu mực": `<input type=color>`, which yields `#rrggbb`.
    - "Tóc": select over `HAIR_STYLES` with labels short "Ngắn", long "Dài", ponytail "Buộc đuôi ngựa", none "Không".
    - "Giọng": select over `VOICE_IDS` with labels narrator "Người dẫn chuyện", female_young "Nữ trẻ", male_young "Nam trẻ", female_old "Nữ lớn tuổi", male_old "Nam lớn tuổi", child "Trẻ em".
    - "Mô tả": ≤ 500 chars.
    - A live `ScenePreview` of the draft look redraws on every change (`trigger='view'`).
    - "Lưu" sends POST or PATCH (a PATCH sends only the changed fields). A 400 shows the details.
  - "Lưu trữ" sends DELETE after confirming "Lưu trữ {name}?".
  - Viewers (`role === 'viewer'`) see no write controls.

- [ ] **Step 1: Write the failing tests.**
  - `characters render with a live preview of their look`: the mocked `drawFrame` receives a timeline whose `cast[0].look` equals the character's look.
  - `changing Màu mực redraws the draft preview with the new ink`.
  - `create posts name, look, voice_id and description`.
  - `edit patches only the changed fields`.
  - `archive asks for confirmation and sends DELETE`.
  - `a viewer sees no Thêm, Sửa or Lưu trữ buttons`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): cast page with live engine preview of each look`.

### Task 14: Settings `/settings`

**Files:**
- Create: `apps/web/src/pages/Settings.tsx`, `apps/web/src/components/ChannelForm.tsx`
- Test: `apps/web/test/settings.test.tsx`

**Interfaces:**
- Consumes: `useWorkspace`, `useSaveWorkspace`, `useChannels`, `useSaveChannel`, `useMe`.
- Produces:
  - The "Không gian làm việc" section:
    - "Tên".
    - "Trần chi phí mỗi phim (USD)" and "Trần chi phí mỗi ngày (USD)": `type=number`, `step=0.01`, `min=0.01`, `max=99999`. Empty sends `null`, with the hint "Để trống: dùng mặc định ${effective}".
    - "Lưu" sends PATCH with only the changed fields.
  - The "Kênh" section: one `ChannelForm` per channel plus "Thêm kênh".
    - "Tên hiển thị": 1–80 chars.
    - "Ngôn ngữ": default `vi-VN`, 2–35 chars.
    - "Chính sách duyệt": radio `manual` "Duyệt tay" or `auto_if_score` "Tự duyệt khi điểm QA ≥".
    - "Ngưỡng điểm": 0–100, shown and required only for `auto_if_score`.
    - Saving sends POST or PATCH.
  - Viewers get disabled fieldsets with the hint "Chỉ xem".

- [ ] **Step 1: Write the failing tests.**
  - `caps show the effective default as a hint and an emptied cap sends null`.
  - `a cap of 0 or 100000 is blocked client-side`.
  - `switching to auto_if_score reveals a required threshold and patches review_policy and auto_score_threshold`.
  - `add channel posts display_name and locale vi-VN`.
  - `a viewer gets disabled fieldsets`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces.
- [ ] **Step 4: Run** `npx vitest run --project web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): settings for budget caps, channels and review policy`.

### Task 15: "Đội sản xuất" — the live studio floor

The approved mockup is `docs/superpowers/mockups/studio-floor.html`. Its markup and `buildFrames`/`route` script are the geometry and choreography reference: port the coordinates, room layout, poses, bubbles and copy from it. Do not port its fake timer loop; this component is driven by real step events.

**Files:**
- Create: `apps/web/src/components/studio/team.ts`, `apps/web/src/components/studio/layout.ts`, `apps/web/src/components/studio/floor-state.ts`, `apps/web/src/components/studio/StudioFloor.tsx`, `apps/web/src/components/studio/Person.tsx`, `apps/web/src/components/studio/Walker.tsx`, `apps/web/src/components/studio/WorkBubble.tsx`, `apps/web/src/components/studio/Furniture.tsx`, `apps/web/src/components/studio/studio.css`
- Modify: `apps/web/src/i18n/vi.ts` (team names, roles, handoff and chat lines), `apps/web/src/pages/Overview.tsx` (the floor for the first running film), `apps/web/src/pages/FilmDetail.tsx` (the floor above `StepTimeline`)
- Test: `apps/web/test/studio-layout.test.ts`, `apps/web/test/studio-floor-state.test.ts`, `apps/web/test/studio-floor.test.tsx`

**Interfaces:**
- Consumes: `FilmDetail` and `useFilmEvents` (Task 9), `useReducedMotion` (Task 8), `FILM_STEPS` from `@stick/core`.
- Produces:
  - `team.ts`: `TEAM: readonly Member[]` with `Member = { key: 'intake' | FilmStep; name: string; role: string; ink: string; hair: 'short' | 'long' | 'ponytail' | 'none' | 'phones'; pose: 'sit' | 'stand'; flip: boolean; idle: 'rest' | 'hips' | 'chin' | 'phone' | 'stretch' | 'sip' }`. Exactly one member per `FILM_STEPS` entry plus `intake`, with the mockup's values: intake Hùng · trưởng nhóm, story Mai · ý tưởng, screenplay Tùng · biên kịch, validate Linh · kiểm duyệt, voice Khoa · lồng tiếng, timeline Vy · đạo diễn, gate Nam · QA, render Phúc · render, contact Thảo · ảnh bìa. Inks are the cast palette `#1b1b1b`, `#d97757`, `#3d6fb4`, `#8a4fb5`, `#2f8a5b`.
  - `layout.ts`: `ROOMS` (sáng tạo: story/screenplay/validate; studio: voice/timeline; hậu kỳ: gate/render/contact; phòng duyệt: the owner; corridor: intake and the coffee corner), `SCENE = { width: 1280, height: 1000 }`, `spot(key | 'review'): Point`, `doorOf(room, towardRoom): number`, and `route(from, to): Point[]`. Same room → `[spot(to)]`. Different rooms → exit door at the room floor, the same door on the corridor floor, the target door on the corridor floor, the target door at its room floor, then `spot(to)`, skipping corridor door points for intake. `walkMs(a, b) = max(450, round(3 * manhattan(a, b)))`.
  - `floor-state.ts`, pure:
    - `deriveFloor(detail: FilmDetail): FloorState` with `FloorState = { working: Member['key'] | null; done: ReadonlySet<FilmStep>; failed: FilmStep | null; final: boolean; note: string | null }`. `queued` → working `intake`. A `running` step → that step. `awaiting_review`, `approved` or published → `final`. `qa_failed` → failed `gate`. A failed step → failed. `blocked_budget` → note "Chạm trần chi phí". `cancelled` → note "Đã huỷ".
    - `handoffsBetween(prev: FloorState, next: FloorState): Handoff[]` with `Handoff = { from: Member['key']; to: Member['key'] | 'review' }`, one per step that became done, in `FILM_STEPS` order. Several at once (a reconnect snapshot after a gap) collapse to the last one, so the floor never replays a backlog.
  - `<StudioFloor detail: FilmDetail />`:
    - A 1280×1000 scene scaled to its container width with a `ResizeObserver` (`transform: scale(w / 1280)`, the box keeps the aspect ratio). It renders only when the container is ≥ 720px wide. Below that it renders nothing, and the page keeps `StepTimeline`.
    - Rooms, walls, doors and furniture as in the mockup. Furniture glows `--accent` for the working member (screen, ON AIR sign, storyboard frame, softbox, render rack lights).
    - The working member types and shows their `WorkBubble` (the mockup's per-step bubble art). Others play their idle loop with per-member `animation-delay` so nobody moves in sync.
    - A handoff plays the mockup sequence: the sender stands ("Xong phần mình rồi!"), walks `route(from, to)` carrying an orange file, says "Gửi {name} nè!", the receiver answers "Ok, để mình lo!", and the sender walks back. Handoffs queue; a new one starts after the current finishes.
    - `final` puts the film card on the owner's desk, and the team cheers once ("Ship it!"). `failed` shows that member's bubble with the step's status label and no walk. `note` shows Hùng saying the note.
    - Light chatter: while a step is running for more than 6 s, one idle member says one line from `vi.ts` every 8 s at most.
    - The scene is `aria-hidden="true"`. Next to it, a visually hidden `role="status"` line names who is doing what, e.g. "Tùng đang viết kịch bản".
    - Reduced motion: no walking, no idle loops and no chatter; the working member and the final card still show.
  - Overview: in "Đang chạy", the first running film shows a `StudioFloor` (it reuses that film's existing `useFilmEvents` stream, so the 3-stream cap holds). Film detail: the floor sits above `StepTimeline` while the film is `queued` or `running`, and collapses to a "Xem đội làm việc" toggle otherwise.

- [ ] **Step 1: Write the failing tests.**
  - layout: `every FILM_STEP has exactly one member and a spot`, `a route inside one room goes straight to the target`, `a route between rooms passes the exit door and the target door on the corridor floor`, `walkMs grows with distance and is at least 450`.
  - floor-state: `queued means Hùng is working`, `a running screenplay means Tùng works and story is done`, `awaiting_review is final`, `qa_failed fails the gate`, `one step finishing yields one handoff to the next member`, `a snapshot that skips several steps yields only the last handoff`, `contact finishing hands off to review`.
  - component (fake `ResizeObserver` at 1280px, fake timers):
    - `the floor is aria-hidden and the status line names the working member in Vietnamese`.
    - `a step event that finishes story makes Mai walk to Tùng and Tùng start working`: assert the walker appears with Mai's ink, the "Gửi Tùng nè!" line shows, and after the timers Tùng's bubble is visible.
    - `reduced motion renders no walker and no idle animation classes but still highlights the worker`.
    - `below 720px the floor is not rendered`.
    - `qa_failed shows Nam's bubble with Trượt QA and no final card`.
- [ ] **Step 2: Run** `npx vitest run --project web`. Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces, porting geometry and art from the mockup.
- [ ] **Step 4: Run** `npx vitest run --project web` and `npm run typecheck`. Expected: PASS and clean.
- [ ] **Step 5: Commit** `feat(web): live studio floor, one teammate per step carrying the film between rooms`.

### Task 16: End-to-end in a real browser, contract, accessibility, docs

**Files:**
- Create: `playwright.config.ts`, `e2e/serve.ts`, `e2e/film-flow.spec.ts`, `e2e/contract.spec.ts`, `e2e/a11y.spec.ts`
- Modify: `vitest.redis-setup.ts` (export `startRedis()`), root `package.json` (devDependencies `@playwright/test 1.65.1` and `@axe-core/playwright 4.14.0`), `.gitignore` (`test-results/`, `playwright-report/`, `apps/web/dist/`), `docs/runbook.md`
- Create: `docs/superpowers/plans/2026-11-22-plan-5-followups.md` (rulings and deferred items, same format as plan 4's)

**Interfaces:**
- Produces:
  - `startRedis(): Promise<{ url: string; stop(): Promise<void> }>`, extracted from the global setup. The default export now uses it.
  - `e2e/serve.ts` starts, in one process:
    - `startRedis()`
    - temp storage and cache dirs
    - in-memory PGlite (`createDb({})`)
    - `seedWorkspace(db, { email: E2E_EMAIL, password: E2E_PASSWORD })`, with `E2E_EMAIL = 'owner@e2e.test'` and `E2E_PASSWORD = 'e2e-password-123'`, exported from `e2e/constants.ts`
    - `loadServerConfig({ STICK_FAKE: '1', STICK_URL_SIGNING_KEY: <32+ chars>, STICK_WEB_DIR: 'apps/web/dist', … }, 'dev')`
    - `buildApp` with a real hub, queues and publisher
    - `startWorker`
    - `listen` on `127.0.0.1:${E2E_PORT = 4317}`
    It cleans up on SIGTERM.
  - `playwright.config.ts`:
    - `testDir 'e2e'`, `timeout 300_000`, `workers 1`, `fullyParallel false`.
    - `webServer { command: 'npx tsx e2e/serve.ts', url: 'http://localhost:4317/healthz', reuseExistingServer: false, timeout: 60_000 }`.
    - `use { baseURL: 'http://localhost:4317', channel: process.env.STICK_E2E_CHANNEL }`. `localhost`, not `127.0.0.1`, because browsers keep `Secure` cookies only on localhost over plain HTTP.
    - One project, `chromium`.

- [ ] **Step 1: Write the specs.**
  - `film-flow.spec.ts`, test `owner logs in, creates a film, watches its steps go live, approves it on a phone, then a bad screenplay edit shows the issue`:
    - Log in with the labelled fields, and expect the heading "Tổng quan".
    - On `/films`, click "Phim mới", fill "Tiêu đề" with "Phân số là gì?" and submit. Expect the URL `/films/<uuid>`.
    - Without any reload, expect all 8 `[data-step]` rows to reach `data-status="succeeded"` (timeout 280 s), and the status pill "Chờ duyệt".
    - Assert that at least one row was seen with `data-status="running"`, using a `MutationObserver` installed via `page.evaluate` before the worker gets far. This proves the SSE updates.
    - `page.setViewportSize({ width: 390, height: 844 })`, go to `/review`, and expect a `video` whose `src` contains `/v1/assets/` and a "Duyệt" button inside the viewport with a box height ≥ 48. Click it and expect "Hết phim chờ duyệt".
    - Back on the film detail, expect "Đã duyệt".
    - On the "Kịch bản" tab, choose "Sửa JSON", replace the first `"action": "<x>"` with `"action": "fly_to_moon"`, and click "Lưu". Expect a `role=alert` containing `unknown_action`, and the status still "Đã duyệt".
  - In the same file, test `a film card draws ink on its canvas in a real browser`: on `/films`, the first card's canvas has more than 100 pixels darker than `#808080` (`getImageData` via `page.evaluate`) once the card is hovered.
  - `contract.spec.ts`, test `every GET the web uses parses with the web schemas`. Log in with `request.newContext()`, then fetch `/v1/me`, `/v1/workspace`, `/v1/channels`, `/v1/characters`, `/v1/films`, `/v1/films/:id`, `/v1/films/:id/versions`, `/v1/review-queue` and `/v1/usage`, and parse each `data` with the matching schema from `apps/web/src/api/schemas.ts`. Expect `success` for all. The flow test leaves at least one film behind, so specs run in file order `film-flow` → `contract` → `a11y` (name them `1-…`, `2-…`, `3-…` if order is not otherwise guaranteed).
  - `a11y.spec.ts`, test `no axe wcag2a/wcag2aa violations on login, overview, films, film detail, review, cast and settings`: `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()` → `violations` equals `[]` on each page.
  - `a11y.spec.ts`, test `the review actions are reachable by keyboard and show a focus ring`: Tab until "Làm lại" is focused, and its `outline-style` is `solid`.
- [ ] **Step 2: Run** `npm run test:e2e:web`. Expected: the specs fail where the UI is incomplete or wrong, and PASS once Tasks 6–14 are done. If the pinned Playwright's Chromium build is not in `~/Library/Caches/ms-playwright` (builds 1248 and 1255 are cached today), run `npx playwright install chromium` once (this needs the network). If that is impossible, set `STICK_E2E_CHANNEL=chrome` to use the installed Google Chrome.
- [ ] **Step 3: Fix** what the specs find, in the task that owns the code (an axe contrast hit means a token or accent-rule fix, never an axe rule exclusion).
- [ ] **Step 4: Run** `npm test`, `npm run typecheck` and `npm run test:e2e:web`. Expected: everything green. Record the new test totals.
- [ ] **Step 5: Docs and commit.**
  - In the runbook add a "Web UI" section:
    - dev: `npm run dev` + `npm run web` → http://localhost:5173
    - production: `npm run web:build`, export `STICK_WEB_DIR=apps/web/dist`, then `npm run dev` or `npm run api`
    - phone: `tailscale serve --bg 3000`, then open `https://<machine>.<tailnet>.ts.net`
    - Safari keeps no `Secure` cookie on `http://localhost`, so use Chrome for local dev or the Tailscale URL
  - Write the plan-5 follow-ups (at least: per-step cost, CSP — the rig needs `new Function`, so a CSP must allow `'unsafe-eval'` or the browser must load the vendor as a classic script —, the unique asset index from plan 4, the queue-helper move, `/topics` and `/library` in P2, and dark theme).
  - Commit `test(e2e): browser flow, api contract and axe checks; docs: web runbook and plan 5 follow-ups`.

---

## Self-review

- **Spec coverage.**
  - §10 pages: login (T7), `/` (T10), `/films` (T10), `/films/[id]` with the player, step bar, screenplay tab with edit, QA tab, versions, redo from step X and cancel (T11), `/review` (T12), `/cast` (T13), `/settings` (T14).
  - Shared components: `<FilmPlayer>`, `<StepTimeline>` and `<CostBadge>` (T9), `<ScenePreview>` (T8), `<ReviewCard>` (T12).
  - `/topics`, `/library`, TikTok connect and voice audition are deviations with a reason.
  - §9: cookie + CSRF unchanged (T4 same-origin, T7), `Idempotency-Key` (T10), Tailscale (runbook in T16).
  - §5 shared engine: T5 + T8, proven in a real browser in T16.
  - Plan-4 "Before plan 5": publish dep and hub try/catch (T1), stale sweep plus the cheap `finishRun` CAS (T2). The asset unique index (it needs a migration), contact-sheet semantics, redo-past-gate and the queue-helper move stay deferred and are listed in the T16 follow-ups.
- **Types.**
  - `FilmDetail.version.id` is introduced in T3 and consumed in T7 and T9.
  - `timeline_url` (T3) is used by `FilmCard` (T10) and `ReviewItem` (T12).
  - `final_url` and `contact_url` (T3) are used in T12.
  - `effective_max_cost_per_day_usd` (T3) is used in T10 and T14.
  - `useFilmEvents` (T9) is used in T10 and T11.
  - `castTimeline` (T8) is used in T13.
  - `STICK_STATES` keys `empty`, `rendering`, `error` and `done` are used in T9, T10 and T12 (T8 swaps one into T7's loading state).
  - `startRedis` (T16) replaces the inline global-setup body.
- **Proportion.** The steps carry signatures, exact values and test names, not component bodies.
