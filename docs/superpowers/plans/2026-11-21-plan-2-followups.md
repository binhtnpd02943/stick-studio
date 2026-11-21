# Plan 2 — rulings and deferred follow-ups

Branch plan-2-llm-tts, commits a93ccf0..153036f. 248 tests pass, typecheck clean. Live Claude API path NOT yet verified (.env key returned 401).

## Before the first live run
- Run `npx tsx packages/providers/scripts/smoke.ts` with a valid key, then one `npm run make -- "<topic>"`; record cost, repair rounds, cacheReadTokens.
- Most likely live failures (final review): max_tokens truncation on screenplay (effort high, 16000 incl. adaptive thinking → consider streaming + higher max or effort medium); story rejected by hook/title/cast limits with no retry; missing_line repair not converging on punctuation drift; refusals lack stop_details.category in the error.

## Rulings
- | Pair/Task | Shared | Finding | Ruling |
- | T3 self | test 2 says "same helper Task 5 uses" but T5 is later | ordering conflict | Ruling: T3 walks the zod tree asserting no checks; no JSON helper — cheap, T5 can add a JSON-level test — cost if wrong: one weaker test |
- | T3↔T5 | LLM schemas; T5 spike may switch to zod/v4 | T5 may edit T3 files | Ruling: T5 allowed to rewrite llm-schemas.ts to zod/v4 and adjust T3 tests — spike decides — cost: small rework |
- | T4↔T6 | prompt fns, Issue | repairUser takes Issue[] incl. new codes schema/missing_line added in T6 | Ruling: T6 extends IssueCode; repairUser prints any code generically — clean |
- | T7 self | FakeTts uses estimateLineDuration (@stick/pipeline) from providers | providers→pipeline import; no cycle (pipeline never imports providers) | Ruling: allowed — DRY over purity — cost: a dep edge |
- | T8 self | STICK_FAKE_EMPTY test hook; smoke/fixtures | test hook in prod code, gated to --fake only | Ruling: keep, only honoured with --fake |
- | T5 self | smoke script path not in Files list | | Ruling: allowed at packages/providers/scripts/smoke.ts |
- Task 1: implementer DONE_WITH_CONCERNS 28853e1. Ruling: updated solve test value 1.47→1.42 accepted — direct consequence of distance-aware min floor — cost: none. Ruling: library→core dep + MARK_RE export accepted — library needs mark grammar — cost: one extra export. Reviewer a10e72dcad4dbefd4 dispatched.
- Task 4: review Needs fixes (3 Important: say-or-do rule, zoom 1–2, title ≤80 missing from prompts). Ruling: example cast missing `lan` upgraded Minor→Important — models copy examples — cost: one line. Fix round 1 sent to a80588c585e287a9e (FIX_BASE 43ba928).
- Task 5: implementer DONE_WITH_CONCERNS d9c8ca3. Live smoke → 401 invalid x-api-key (key in .env rejected). Ruling: proceed with fakes; live checks (T5 smoke, T8 live E2E) blocked on user supplying a valid key — reported at end — cost: live path unverified until then. Ruling: messages.create + own safeParse instead of messages.parse accepted — parse() throws before stop_reason is readable, breaking LlmTruncatedError mapping — cost: lose SDK convenience. Ruling: llm-schemas/providers moved to zod/v4 (pre-approved).
- Task 6: dispatched (BASE d9c8ca3, implementer a818240bd061c51b9, sonnet). Ruling: duplicate start.who detected pre-conversion as schema issue (from T3 minor).
- Task 6: implementer DONE_WITH_CONCERNS 99dfc08. Ruling: extra usage field on ScreenplayRejectedError accepted — needed for budget booking — cost: none. Ruling: package-level cycle prompts↔pipeline (type-only) tolerated for now; deferred minor: move Issue to core.
- Task 7: implementer DONE_WITH_CONCERNS 6151dd9. Ruling: wav utils live in core (providers re-exports) — pipeline needs wavSeconds without importing providers — cost: none.
- Task 7: review Needs fixes (say executes [[cmd]]; cache trusts mid-data truncation). Ruling: neutralise '[[' → '[ [' — literal speech beats byte-exact text — cost: none audible. Ruling: say timeout upgraded Minor→Important — hang blocks whole run. Fix round 1 sent (FIX_BASE 6151dd9).
- Task 7: fix 1852c8f. Ruling: literal-speech test compares against spoken words 'slnc 3000 xin chào' (my 1 s spec was wrong) — accepted.
- Task 8: implementer DONE_WITH_CONCERNS 2d40488 (live E2E skipped — key). Ruling: budget checked per LLM call (stricter than per step) accepted. Ruling: extra run.json fields repairRounds/durationSec accepted.
- Task 8: review Needs fixes (3 Important: price by returned model id → budget bypass; stale downstream markers + non-atomic film.mp4; topic reuse in same dir). Ruling: price by configured model, keep servedModel for audit. Fix round 1 sent (FIX_BASE 2d40488) incl. minors atomic writeArtifact, lazy fakeResponses.
- Final review (ac64f86ccb008ed32, opus): With fixes — Important: failed paid calls unbooked; hook not enforced on spoken line. Ruling: one fix wave also includes prompt v2 (12 tiếng wording, walk_to example, <story> escaping) + one-line LlmSchemaError — highest live-run risk, cheap — cost: prompt version bump. Other minors parked (can wait per final reviewer triage): package cycles, zod pin, missing_line speaker/order, --fresh keeps spend, stale film on failed --fresh, unused ScreenplayRejectedError.usage, StoryRejected→exit 2 undocumented.

## Deferred minors (final reviewer: all can wait)
- Task 4: minor (deferred): localeCompare in catalogText (use plain < for byte stability)
- Task 4: minor (deferred): story word-count hint 50–150 too low for 20 s at 175 WPM (~60–170)
- Task 4: minor (deferred): <story> JSON not bracket-escaped in screenplayUser
- Task 4: minor (deferred): prompt doesn't state uniqueness of scene/prop/cast ids
- Task 4: minor (deferred): tests missing for MAX_RECENT cap, screenplayUser
- Task 4: minor (deferred): example has lan acting on board at right from center without walk_to (contradicts rule 5)
- Task 5: minor (deferred): providers uses zod/v4 via SDK helper but doesn't declare zod dep
- Task 5: minor (deferred): constraint test walks z.toJSONSchema not zodOutputFormat payload
- Task 5: minor (deferred): smoke.ts not typechecked, doesn't print stop reason
- Task 6: minor (deferred): prompts↔pipeline package cycle (move Issue/IssueCode to core)
- Task 6: minor (deferred): schema issue split at ': ' — no guard for missing separator
- Task 6: minor (deferred): missing_line message is the bare line; prefix "Thiếu câu thoại:" for clarity
- Task 6: minor (deferred): tests for unknown_prop/backdrop libraryRequests, maxRepairs=0
- Task 7: minor (deferred): zero-length clip accepted by voiceScreenplay
- Task 7: minor (deferred): VOICE_RATES not in cache key (stale audio if rates change)
- Task 7: minor (deferred): providers→pipeline runtime + pipeline→providers dev cycle (tolerated)
- Task 8: minor (deferred): tts cache / recentStories use dirname(--out)
- Task 8: minor (deferred): voice marker doesn't hash line text (hand-edited screenplay keeps old audio)
- Task 8: minor (deferred): exit 4 printed on stdout
- Task 8: minor (deferred): no spawned test for exit-2 libraryRequests path
- Task 8: minor (deferred): LlmSchema/Truncated/Refusal errors thrown after paid call lose usage (not booked to budget)
- Final review: package cycles prompts↔pipeline, providers↔pipeline(dev) — move Issue/IssueCode + estimateLineDuration to core at start of plan 3
- Final review: pin zod ~3.25.76, declare in providers; later move core fully to zod/v4; LlmScreenplaySchema/ScreenplaySchema are hand-maintained twins
- Final review: missing_line checks membership only (not speaker/order/NFC)
- Final review: --fresh keeps cumulative spend (cap is per run dir) — document
- Final review: failed --fresh rerun leaves old film.mp4 beside new story.json
- Final review: ScreenplayRejectedError.usage unused (double-count risk); StoryRejectedError→exit 2 undocumented
- Fix wave: hook refine fires after paid story call with no retry; stale cached story.json from story@1 may fail the new refine on resume
