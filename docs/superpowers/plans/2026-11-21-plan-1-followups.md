# Plan 1 follow-ups (carried from SDD ledger)

## Rulings made during execution
- Branch: feat/plan-1-engine-render (base 5764a6c on main). Ruling: branch in place instead of worktree — repo was just created, nothing else lives on it — cost if wrong: none.
- Ruling: T9 motion gate test lives at packages/render/test/library-gate.test.ts, not packages/library/test — avoids library→render cycle — cost if wrong: file location only.
- Ruling: root vitest.config.ts includes packages/*/test/** and scripts/**/*.test.ts (T1 sets it up) — cost if wrong: none.
- Ruling: fixture specExample uses think instead of scratch_head (not in catalog); camera.focus validated as target — spec example illustrative; later tasks render fixture with defaultCatalog — cost if wrong: trivial
- Ruling: near:<prop> resolves to propX ∓ (prop.width/2 + NEAR_GAP=18), cast targets CAST_GAP=40 — plan's flat NEAR_OFFSET=45 put figures inside a 90-wide whiteboard (seen in frames) — cost if wrong: small re-tune
- Ruling: cameraShift (keep figures in frame while zoomed) approved as design — prevents half-cropped characters seen in visual check — cost if wrong: framing tweak
- Ruling: long captions are paged over the line window (52px pages, split by char count) instead of ellipsized — schema allows 160-char lines; truncation drops heard dialogue — cost if wrong: small. CAPTION.cx=500 kept deliberately (clears TikTok right rail).
- Ruling: ffmpeg gets -hide_banner -nostats -loglevel error (stderr tail must hold real errors per review focus #4); frame count ceil(d*30 - 1e-9) — float noise added a frame — cost if wrong: none
- Ruling: library gate plays each action at min/ideal/max (talk capped 5s); head-covered gets a triggering test — solver picks any duration in range — cost if wrong: slower CI
- Ruling: final review Important 6 (distance-aware walk durations + move mark geometry to core/library) deferred to plan 2 task 0 — gate fails safe today — cost if wrong: some LLM screenplays rejected by motion gate until plan 2

## Deferred items
- Task 4: minor (deferred): catalog lookups use `in`/indexing — prototype keys (toString, constructor) pass validation; use Object.hasOwn (trust boundary for LLM output — final review should fix)
- Task 4: minor (deferred): untested edges (prop mark near:unknown, camera.focus accepting mark/cast, not_on_stage dedupe); cross-package fixture import path
- Task 5: minor (deferred): durations map NaN/negative not guarded (Number.isFinite && >0 else estimate) — matters when TTS probe fails in plan 2; untested camera-only & multi-character beats
- Task 6: minor (deferred): cast-target walk order dependence; FIG_HALF ignores arm reach; caption stub is a comment (T7 replaces); center start faces right; double cast g->CanvasRenderingContext2D; near:-mark prop recursion; long lines
- Task 7: minor (deferred): pageCaption recomputed per frame, O(words^2) measuring (120 words = 26.7ms/frame) — memoize by text; empty-lines -Infinity guard; paged last page may be 60px vs 52; missing try/finally around save/restore
- Task 8: minor (deferred): Promise.race closure per frame; frames reports planned not written; muxAudio outPath===videoPath deletes source; tests don't assert codec/pix_fmt/fps; /usr/bin/false platform path
- Task 8: minor (deferred): pid-wrapper test small race (poll pid file); test temp dir never cleaned
- Task 9: deferred (load-bearing for plan 2): walk_to duration should be distance-aware in the solver (min 1.1s clean only up to ~190 units; stage spans ~300)
- Task 9: minor (deferred): head-covered test hides the whole figure (destination-over), not true occlusion — use 2nd figure overlapping head; cheer Math.max(0.3, RAMP_S/dur) confusing literal; scene-boundary skip untested
- Known defect (from T10, in T6 code, load-bearing for plan 2): talk window compressed into a tiny gap after an action ends near the line end → jump (think + 3.0s line gives jump handF 6.5). Fix in final-review wave: skip talk when window < ~0.5s (hold base). Also: camera zoom crops props at left/right marks; whiteboard always shows 'plan.md'.
- Task 10: minor (deferred): schema errors 'schema <path>: msg' format; process.exit may truncate piped output; whiteboard 'plan.md' placeholder (plan 5)
- Task 10: minor (deferred): partial audio coverage silent; exit-3 not e2e
- Final fix wave: 1aa7405, re-review clean. Deferred to plan 2: case-insensitive id collisions on filenames (lowercase ids).
