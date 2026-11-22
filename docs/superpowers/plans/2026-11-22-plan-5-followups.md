# Plan 5: rulings and deferred follow-ups

Branch plan-5-web-ui, commits 5eacaf6..HEAD. The web UI (apps/web) runs the whole owner flow in a real browser against the fake pipeline: login, a new film with live steps and the studio floor, phone review, a screenplay edit with server issues, cast and settings. Playwright covers the flow, the API contract and axe (wcag2a/wcag2aa) on every page. Operating notes are in [docs/runbook.md](../../runbook.md).

## Before P2
- Per-step cost. The film-detail mockup shows a cost per step; it is not built. Usage is booked per film version, not per step, so this needs a `step` column on usage (a migration) and an API field.
- Content Security Policy. None is set. The rig (`packages/engine/src/vendor/stick-rig.js`) is built with `new Function`, so a CSP must allow `'unsafe-eval'`, or the browser must load the vendor as a classic script and the rig must be taken from it.
- Unique asset index (from plan 4). `assets (film_version_id, meta->>'path')` still has no unique index and `replaceAsset` no `ON CONFLICT`; concurrent re-deliveries can leave two assets for one path. Needs a migration. (The cheap `finishRun` compare-and-set landed in plan 5 Task 2.)
- Move the queue helpers (`createQueues`, `enqueueStep`, `redisPublisher`, `urlTarget`) out of apps/worker into a package (from plan 4). The API, and now `e2e/serve.ts`, still import them from the worker, which pulls in canvas.
- Contact-sheet failure semantics (worker fails the film, `make` CLI warns) and redo-past-gate skipping QA, both still open from plan 4.
- `/topics` and `/library` pages, TikTok connect and voice audition are P2 (deviations in the plan).
- Dark theme. Light only on purpose in P1; the tokens are on `:root` in `apps/web/src/styles/tokens.css`, so a dark set is a token override.
- Studio floor, still open: a possible double cheer when contact-succeeded and awaiting_review arrive as separate SSE events; a real-run (non-fake) visual check of the work bubble, since in fake mode the steps outpace the walk animations; chatter's 6 s timer counts from when the floor first sees a step running, not from `started_at`. (The heading gap and overlapping name tags seen in the Task 16 screenshot are fixed in c2817bb.)

## Rulings
Controller rulings from the plan-5 ledger, with the cost if each was wrong.
- | Scope | Ruling |
- | Preflight | Every "Proposed ruling" in preflight.md (50 rows, 39 FIX) is binding and overrides the plan text where they differ. Cost if wrong: rework in the affected task, caught by its review. |
- | Preflight | Each implementer and reviewer gets preflight.md and applies every row naming its task. Cost: a missed row surfaces in review. |
- | T16 | "Tasks 6–14" in T16 means Tasks 6–15; the studio floor never uses `data-step` or `data-status`, so the `[data-step]` selectors match only `StepTimeline`. |
- | T1 | Announce awaits publish but bounds it at 1000 ms (logged), since an unbounded await hangs forever when Redis is down. Cost if wrong: a slow-but-alive Redis drops a few events, resynced by the SSE snapshot. |
- | T7 | The malformed-`next` fix (`new URL` throwing) folded into round 2 with the `//host` bypass fix. Cost: none. |
- | T10 → T12 | `timeline_url` added back to review-queue items (signed, nullable) so Overview "Chờ duyệt" cards preview like the mockup; preflight A10 had dropped it on a false premise. Cost: one backend field and a test. |
- | T10 | Promoted to round 1: compact timeline status by colour alone (a11y), invalid-field outline overriding the ink focus ring, timeline JSON `gcTime` 5 min against "cache asset JSON forever". Cost: small CSS and one-line changes. |
- | T11 | Hard-coded `aria-label="Video"` moved to vi.ts (all UI text in vi.ts). Cost: trivial. |
- | T12 | The re-reviewer's only Important was missing test output; the controller ran it (web 18 files / 140 passed, typecheck clean) and confirmed "Gửi" is disabled while busy. No further round. |
- | T14 | The cap hint "Để trống: dùng mặc định …" shows only when the saved cap is null; otherwise "Đang đặt $X". Misleading money info outweighs the plan text. Cost: copy change. |
- | T14 | Promoted to round 1: a manual channel save silently wiping the stored threshold, and a number input's badInput silently resetting a cap to default. Cost: small. |
- | T15 | The film-detail floor moved above `.film-detail-grid` at full width, so it shows on common laptop widths. Cost: layout move. |
- | T15 | Intake→story handoff added (Hùng carries the brief to Mai, as in the mockup). Cost: one branch and a test. |
- | T15 | Round 1 also took: `key={film.id}` on the floor, queue capped at current + latest, walker excluded from chatter, Mai→Tùng bubble only after the handoff, "ON AIR"/"ĐẠT" moved to vi.ts. Cost: small. |

## Deferred minors
Everything the ledger marked "minor (deferred)" that no later task fixed.

Backend (Tasks 1–4)
- A duplicated "fail film, log, announce if changed" block in film-actions.ts and films.ts (extract `failFilm`). The events-hub onError-once test relies on no other error path firing. films.test's never-resolving publish case waits a real 1 s (use fake timers). A timed-out publish stays in the ioredis offline queue and may deliver a stale film event after reconnect (the snapshot resyncs).
- Stale sweep: ticks can overlap and `close()` awaits only the newest; the interval is created before the workers and leaks (unref'd) if `startWorker` throws; `owner!` assertions in `sweepStaleRuns`; a steps.ts ↔ films.ts import cycle. The A5 test does not assert the film ended failed, and the failure-path `finishRun` no-op still publishes a duplicate step failed. The runbook's "cancel then redo" is unverified for failed films, and `test:db:pg` was not run for the sweep SQL.
- The asset-content rate-limit test proves >120, not 600 per IP. review-queue.ts `finalId && …` (use a ternary); `signedAssetUrl` `nowS` untested directly.
- Static SPA requests share the 120/min rate budget, so a cold load spends API budget (allowList or a runbook note). No direct `resolveWebFile` unit or HEAD test; dotfiles in dist may bounce via @fastify/static. A nested index.html would skip the shell headers; the "any case" comment overstates case-folding.

Engine bridge and shell (Tasks 5–8)
- frame-browser-safe `typeCheckOnly` relies on typecheck covering tests; the static-import scan misses dynamic `import()`; no positive instrument test.
- `.gitignore` `dist/` is broader than `apps/web/dist/`. No favicon. The font comes via a CSS `url` instead of `?url`.
- Logout failure is swallowed (no ErrorNotice on `logout.isError`). The global 401 path does not clear the csrf token or the query cache, so the previous session's data is visible until refetch. ErrorNotice has an unused `_rateLimited` destructure, and a missing `retry_after_s` renders "0 giây". No direct ErrorNotice, `useFilm` polling or invalidation tests. `crypto.randomUUID` needs a secure context (Tailscale HTTPS is fine).
- ScenePreview's IntersectionObserver reads `[entry]` (use `entries.at(-1)`); no unmount-cleanup test; a misleading "idle loop" test comment; the reduced-motion canvas is not redrawn on resize; an interactive preview without a label is an unnamed img.

Film pages (Tasks 9–11)
- `useSignedMedia` `retried`/`failedUrl` are not reset on asset change. CostBadge `aria-valuenow` exceeds `aria-valuemax` when over the cap, with no `aria-valuetext`.
- `useFilmEvents` unmount leaves `['film-live', id]` = 'live' (gcTime Infinity), so a remount shows stale live; set offline/connecting in cleanup.
- StepTimeline casts StepError unvalidated ($0.00/$0.00, NaNs possible); `key={line}`; `formatUsd` lives in a component file; `vi.budgetHit` holds logic. FilmPlayer shows "Đang làm phim…" while the URL loads; the video box has no max size. No StatusPill or skipped-step tests. `console.warn` in events.ts.
- NewFilmForm errors are not announced or focused; closing the dialog while the POST is pending skips navigation; the brief is silently truncated at 2000; `film-grid-3` is half-dead; `canHover` is read once. Test gaps: `/films?status=running` landing, queued merge, review cap 3, card size.
- The Overview cost block and "Gần đây" fail silently (no ErrorNotice); the compact-status test asserts display only; stray blank lines in base.css.
- `parseScreenplay` runs every render; edit is disabled with no hint when there is no screenplay asset; a 409 on save does not refetch; tabs lack Home/End; a useless Fragment. Dangling `aria-controls` for unvisited tabs; the visited set is not reset per film; no banner-recovery test. Test gaps: StatusPill/player asserts, 409/network keeps edits, 422 in JSON mode, roving tabIndex.

Review, cast, settings (Tasks 12–14)
- A 409 on a pinned film does not invalidate `['film', id]`, and the pinned film may duplicate; the reason can exceed 500 after a label change; focus falls to body after a decision, plus the toast live region; the timeline comes via an extra query instead of the film detail assets; swipe has no `isPrimary` check and no "swipe makes no POST" test; a `?film` detail error is silent. The Tab-order test title is stale; the in-flight test has no RED evidence and no positive swipe control.
- The cast test title overclaims (no refetch-failure test); the `looks()` test also sees the idle timeline; a null-look edge in `changes()`.
- No test that a valid cap is sent as a number; the 0/100000 re-validate test is weak; `NAME_MAX` duplicated; no locale or name length tests; "Đã lưu" shows after a revert. The threshold half of the garbage-input test is not a regression guard (`thresholdBad` redundant), and `thresholdBad` goes stale after a manual↔auto toggle.

Studio floor (Task 15)
- Chatter starts 6 s from first sight, not from `started_at`; a failed film without a failed step gets the idle status line.
- A possible double cheer when contact-succeeded and awaiting_review arrive as separate SSE events; the cheer is dropped if the final lands with a non-review handoff; on-screen chatter can overlap a new walker.

Carried over from plan 4: see [plan 4 follow-ups](2026-11-22-plan-4-followups.md) (live-run prerequisites, Task 1–11 minors).
