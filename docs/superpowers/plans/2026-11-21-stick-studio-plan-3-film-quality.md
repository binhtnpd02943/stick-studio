# Stick Studio Plan 3 — Publishable film quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run make` films publishable. That needs a library big enough to tell everyday stories (about 30 actions, about 12 props, 8 backdrops, as spec §7.2 asks), characters that can be told apart, a reach rule the validator enforces, a pacing gate, sound effects and an optional licensed music bed mixed to TikTok loudness, and a contact sheet for the human review gate.

**Architecture:** This plan builds on plans 1–2. Every new action, prop and backdrop is a plain module in `@stick/library`. The existing library motion gate (`packages/render/test/library-gate.test.ts`) plays every catalog action at its min, ideal and max duration, so new actions are gated without any extra wiring. Hand-held objects (phone, book, cup) are drawn by the action through a new optional `overlay` on `ActionResult`. Sound effects are synthesised deterministically by ffmpeg (`aevalsrc`/`anoisesrc`), so they are original and need no licence. Music is only ever a file the owner supplies, together with a licence sidecar (spec §6 "Hệ thống không tự tải nhạc"). DB/API/worker/web come in plan 4.

**Tech Stack:** Node 24 ESM, TypeScript, npm workspaces, zod, @napi-rs/canvas, ffmpeg 9 (`loudnorm`, `sidechaincompress`, `aevalsrc`, `anoisesrc`, `amix`, `ebur128`), vitest.

**Spec:** `docs/superpowers/specs/2026-11-21-stick-studio-design.md`. The sections that bind this plan:
- §6, the sound/music decision and the qa step
- §7.2, the starter library
- §7.3, semantic checks, including reach of ~37 units
- §13, the motion gate in CI

Follow-ups: `docs/superpowers/plans/2026-11-21-plan-1-followups.md`, `2026-11-21-plan-2-followups.md`.

## Global Constraints

- **World coordinates.** Ground is y = 0 and up is negative. The stage spans x ∈ [−150, 150] (`STAGE.worldWidth` 300). Nothing a prop or backdrop draws may go above y = −185 or outside x ∈ [−150, 150]. Props draw with their base at y = 0, centred on the x they are given.
- **Determinism.** Same timeline means the same frames and the same audio bytes. No `Math.random`, `Date` or wall-clock time in library, render or sfx code. Any variation must derive from `t`, `T` or the action/prop id.
- **Motion gate.** Every action must pass `checkMotion` alone at its min, ideal and max duration (the existing library gate). A failing action is fixed or its duration range is tightened. The gate itself is never loosened.
- **Action contract (unchanged).** `apply(ctx)` is pure. It returns to the rest pose (`base`) at T = 0 and T = dur through a smooth bump of at least 0.3 s (see `cheer.ts` `RAMP_S`), unless it is a locomotion action that ends at the target.
- **Durations.** Each action sets `{min, ideal, max}` in seconds. `max` may be large (up to 10) for "hold" actions such as `sit` and `sleep`, which stretch to fill a long line. Shortcut, noted in each such action: `// shortcut: posture does not persist across beats; a seated character stands between beats. Upgrade when the engine gets persistent postures.`
- **Reach.** `REACH = 37` world units (spec §7.3). An action with `contact: true` must start with the actor within `REACH` of its target's x. Otherwise the validator reports `out_of_reach`, and the repair loop asks for a `walk_to` first.
- **Descriptions.** Every action, prop and backdrop gets a one-line English `description`. It goes into the LLM catalog (spec §7.2). State what it looks like, plus what the target means when there is one.
- **SFX.** Synthesised only. They are cached at `out/.sfx-cache/<id>@<version>.wav` with `SFX_VERSION = 1`, as 48 kHz mono 16-bit.
- **Music.** Used only when the owner passes `--music <file>`. It requires `<file>.license.json` = `{ "title", "author", "license", "source" }`, all non-empty strings. If the sidecar is missing or invalid, exit 1 before any paid call. The licence is copied into `run.json.music`. The system never downloads music.
- **Mix levels.** Voice gain 0 dB, SFX −14 dB, music −22 dB. Music is ducked under the voice with `sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300`. The final mix is `loudnorm=I=-14:TP=-1.5:LRA=11`, AAC 160k, 48 kHz.
- **Pacing.** No interval longer than `MAX_IDLE_S = 2.5` may pass with no active action and no spoken line, from the end of the first beat to the start of the last scene's tail (lesson taken from stickman-video-director). A violation is a gate failure, exit 3, alongside the motion gate.
- **Package graph.** After Task 1, `@stick/pipeline` must not depend on `@stick/prompts` or `@stick/providers`, and `@stick/prompts`/`@stick/providers` must not depend on `@stick/pipeline` at runtime. Shared types live in `@stick/core`.
- **zod.** Pin `"zod": "~3.25.76"` in every package that imports zod or `zod/v4`.

## Review Focus

1. **An LLM screenplay puts a contact action at a prop across the stage.** For example, `type_laptop` on a desk at `right` while the actor stands at `left`. Validate must report `out_of_reach`, and repair must insert `walk_to`. The film must never show typing in mid-air. Covered by the Task 5 validate tests.
2. **A hand-held overlay on a character facing left.** The phone, book or cup must sit in the near hand, mirrored with the figure, and not float on the wrong side. Covered by the Task 5 overlay test, which checks both facings.
3. **Silence, or no SFX at all.** A film with no SFX cues and no music must still mix, with voice only and loudnorm applied. A film with music but a very short voice must not end early. Covered by the Task 8 tests.
4. **A music file with no licence sidecar, or a sidecar with an empty field.** This must exit 1 before any LLM spend, with a message naming the missing field. Covered by the Task 8 CLI test.
5. **A new prop or backdrop drawn partly off-stage or above the frame.** The bounds test must catch it before an LLM can choose it. Covered by the Task 6 bounds test.

---

### Task 1: Untangle the package graph; tighten the faithful-line check

Closes plan-2 follow-ups: the package cycles, the zod pin, and `missing_line` checking membership only.

**Files:**
- Modify: `packages/core/src/index.ts`, add `packages/core/src/issues.ts` (moved `Issue`, `IssueCode`) and `packages/core/src/estimate.ts` (moved `estimateLineDuration`, `SECONDS_PER_WORD`, `MIN_LINE`)
- Modify: `packages/pipeline/src/validate.ts`, `solve.ts`, `index.ts` (import from core, re-export for compatibility)
- Modify: `packages/prompts/src/repair.ts`, `packages/providers/src/tts/fake.ts` (import from core)
- Modify: every `packages/*/package.json` (drop the cycle edges, pin zod), `package-lock.json`
- Modify: `packages/pipeline/src/screenplay.ts` (the faithful-line check)
- Test: `packages/pipeline/test/screenplay.test.ts`, plus a new `packages/core/test/graph.test.ts`

**Interfaces:**
- Produces: `@stick/core` exports `Issue`, `IssueCode` and `estimateLineDuration`. `@stick/pipeline` re-exports them, so existing imports keep working.
- `IssueCode` gains `'line_mismatch'`, which replaces `'missing_line'` and covers wrong speaker, wrong order, and added or dropped lines.

- [ ] **Step 1: Write failing tests**
  - `graph.test.ts` → `no runtime dependency cycles between workspace packages`. Read each `packages/*/package.json` `dependencies` (not devDependencies) and assert the graph is acyclic.
  - Also in `graph.test.ts` → `every package importing zod pins ~3.25.76`. Grep `src/` for `from 'zod` and check package.json.
  - `screenplay.test.ts` → `a line given to the wrong speaker triggers line_mismatch repair`.
  - `screenplay.test.ts` → `swapped line order triggers line_mismatch`.
  - `screenplay.test.ts` → `NFC vs NFD Vietnamese text is still a match`.
  - `screenplay.test.ts` → `an added line not in the story triggers line_mismatch`.
  - The comparison is the ordered list of `(who, text.normalize('NFC').trim())` pairs, story against screenplay.
- [ ] **Step 2: Run the tests.** Run `npx vitest run packages/core/test/graph.test.ts packages/pipeline/test/screenplay.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Make the moves, update the imports and package.json files, and run `npm install` to refresh the lockfile. `line_mismatch` messages name the first differing index: `beat N: expected <who>: "<text>", got …`.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `refactor: shared types in core, acyclic packages; ordered line check`.

### Task 2: Contact sheet and action preview — the eyes for every later task

**Files:**
- Create: `packages/render/src/contact-sheet.ts`, `scripts/preview-action.ts`
- Modify: `packages/render/src/index.ts`, `scripts/make-film.ts` (write `contact.png` after render), `package.json` (`"preview": "tsx scripts/preview-action.ts"`)
- Test: `packages/render/test/contact-sheet.test.ts`

**Interfaces:**
- Produces:
  - `renderContactSheet(tl: Timeline, outPng: string, opts?: { cols?: number; rows?: number; catalog?: Catalog; scale?: number }): Promise<void>`. Defaults: cols 4, rows 3, scale 0.25. It renders `cols*rows` frames at evenly spaced times `t_i = (i + 0.5) * duration / n` into one PNG grid. Each cell is stamped with its time (`1.25s`) in the corner.
  - CLI `npm run preview -- <actionId> [--target left|center|right|near:<prop>] [--dur s] [--prop <type>]` writes `out/preview/<actionId>.png`. That is a 4×3 contact sheet of a solo timeline. It reuses `packages/render/test/solo.ts` logic, moved to `packages/render/src/solo.ts` and exported. When given `--prop`, it places that prop at the target mark.

- [ ] **Step 1: Write failing tests.** Three tests:
  - `contact sheet is cols*scale*1080 by rows*scale*1920`: a 4×3 sheet at 0.25 is 1080×1440.
  - `cells differ when the scene moves`: for a walk_to solo, the cell 0 and cell 11 pixel buffers are not equal.
  - `is deterministic`: two renders are byte-identical.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement both files. `make` writes `<runDir>/contact.png` after `film.mp4` and records `steps.contact`.
- [ ] **Step 4: Run the full suite and check visually.** Run `npm test && npm run typecheck`, then `npm run preview -- wave`. Open `out/preview/wave.png` with the Read tool and confirm the figure is waving.
- [ ] **Step 5: Commit.** Message: `feat(render): contact sheet + action preview CLI`.

### Task 3: Tell characters apart — hair styles; drop the whiteboard placeholder

`look.hair` has been parsed since plan 1 but never drawn. Cast members differ only by ink colour, which is weak on a phone.

**Files:**
- Create: `packages/render/src/look.ts`
- Modify: `packages/render/src/director.ts` (draw hair after `fig`), `packages/library/src/props/whiteboard.ts`
- Test: `packages/render/test/look.test.ts`

**Interfaces:**
- Produces:
  - `jointWorld(pose: Pose, joint: 'head'|'hF'|'hB'|'chest'|'hip', x: number, facing: 1|-1): [number, number]`. This is the world position of a rig joint, honouring `sx` mirroring exactly as `rig.fig` does. Read `fig` in `packages/engine/src/vendor/stick-rig.js` around line 361. Task 5 reuses it for hand overlays.
  - `drawHair(g, rig, pose, x, facing, hair: 'short'|'long'|'ponytail'|'none', ink: string): void`. All styles are drawn in the character's ink, relative to the head centre and the rig's `HEAD_R`:
    - `short` is a cap of strokes on the top half of the head.
    - `long` adds two strands falling to the shoulder line.
    - `ponytail` adds a tail behind the head, which swings with `sin(t)` of amplitude 2 units. To be deterministic, take `t` as a parameter.
    - `none` draws nothing.
- Whiteboard: remove the `'plan.md'` text. The header stays as a line with no text, and the description loses any mention of text content.

- [ ] **Step 1: Write failing tests.** Four tests:
  - `jointWorld mirrors x with facing`: head at facing 1 vs −1 is symmetric about x.
  - `each hair style changes pixels in the head region and nowhere below the shoulders`: render a single frame per style and diff against `none`.
  - `long and ponytail differ`.
  - `whiteboard draws no text`: spy on `rig.text` and expect no call.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the files. The director passes `t`.
- [ ] **Step 4: Run the full suite and check visually.** Run `npm test && npm run typecheck`. Then render `examples/phan-so.screenplay.json` with `npm run render` and view a contact sheet of it. Minh (short) and Lan (ponytail) must be distinguishable at 0.25 scale.
- [ ] **Step 5: Commit.** Message: `feat(render): draw hair styles; whiteboard without placeholder text`.

### Task 4: Action library A — 12 in-place gestures

All of these use `needsTarget: false` and bump in and out of the rest pose. Author the poses with `rig.P`/`rig.mix` like `cheer.ts`. Study the upstream poses in `/private/tmp/claude-501/-Users-mac-Projects-stick-scene/7d9b50dd-1a6f-44a9-b3ca-13f5d44f59df/scratchpad/repo/examples/scenes-p3.js` and `scenes-p4.js`, and in `packages/engine/src/vendor/stick-rig.js`. View every action with `npm run preview -- <id>` before committing.

| id | duration {min, ideal, max} | description (LLM-facing) |
|---|---|---|
| `shrug` | 0.8, 1.2, 2.0 | Shoulders up, palms out at waist height, head tilts. |
| `shake_head` | 0.8, 1.2, 2.5 | Head shakes side to side: no. |
| `facepalm` | 1.0, 1.5, 3.0 | Near hand covers the face, head drops. |
| `clap` | 0.8, 1.5, 3.0 | Hands meet in front of the chest repeatedly. |
| `cry` | 1.2, 2.0, 5.0 | Head down, both hands at the eyes, shoulders shaking; small tear drops fall. |
| `laugh` | 0.8, 1.5, 3.0 | Leans back, hand on belly, shoulders bounce. |
| `stomp` | 0.8, 1.2, 2.5 | Angry: fists down, one foot stamps twice. |
| `look_around` | 1.2, 2.0, 4.0 | Head turns left, then right, scanning; hand shades the eyes. |
| `scratch_head` | 1.0, 1.5, 3.0 | Near hand scratches the top of the head, puzzled. |
| `cross_arms` | 0.8, 2.0, 6.0 | Arms folded across the chest; holds. |
| `bow` | 1.0, 1.5, 2.5 | Bends forward at the hip, then straightens. |
| `jump` | 0.8, 1.0, 1.6 | Crouches, jumps up with arms raised, lands. |

The ids `scratch_head` and `think` both exist now. Keep `think`, which is chin-on-hand.

`stomp` and `jump` move the feet. Use the rig's leg controls (`legs`, `fF`/`fB`), not gait. A `jump` keeps x constant and raises the whole pose by at most 22 units, and the motion gate must stay clean. `cry` draws tears through the `overlay` hook from Task 5. Task 5 comes later, so ship `cry` without tears and add them in Task 5.

**Files:** create `packages/library/src/actions/<id>.ts` × 12 (snake_case ids, kebab-case files); modify `catalog.ts`. Tests: the existing library gate, plus `packages/library/test/catalog.test.ts` (new).

- [ ] **Step 1: Write a failing test.** In `catalog.test.ts`, `catalog has the 12 gesture actions, each with description ≤ 120 chars and min ≤ ideal ≤ max`.
- [ ] **Step 2: Run the test.** Expected: FAIL.
- [ ] **Step 3: Implement the 12 actions.** After each one, run `npx vitest run packages/render/test/library-gate.test.ts -t <id>` and `npm run preview -- <id>`, and view the PNG.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS, with the library gate covering 12 × 3 more cases.
- [ ] **Step 5: Commit.** Message: `feat(library): 12 gesture actions`.

### Task 5: Action library B — locomotion, contact and hand-held actions; reach rule

**Files:**
- Modify:
  - `packages/library/src/types.ts`: add `ActionDef.contact?: boolean`, `ActionDef.speed?: number` (units/s, for locomotion), and `ActionResult.overlay?: (g, rig, at: { x: number; facing: 1|-1; pose: Pose; t: number }) => void`.
  - `packages/render/src/director.ts`: call `overlay` after drawing the figure and hair.
  - `packages/pipeline/src/solve.ts`: generalise `WALK_SPEED` to `def.speed`.
  - `packages/pipeline/src/validate.ts`: add `out_of_reach`.
  - `packages/library/src/stage.ts`: add `REACH`, and `trackPositions`, shared by solve and validate.
  - `packages/prompts/src/screenplay.ts`: bump to `screenplay@3`.
- Create: 12 action files, listed below. Add tears to `cry` from Task 4.
- Test: `packages/pipeline/test/validate.test.ts`, `packages/render/test/overlay.test.ts`, `packages/pipeline/test/solve.test.ts`

| id | target | contact | duration | notes |
|---|---|---|---|---|
| `run_to` | mark/prop/cast | no | 0.6, 0.8, 2.0 | `speed: 200`. Like walk_to, with a faster gait and arms pumping. |
| `walk_to` | (existing) | no | — | Add `speed: 110`; the solver reads it instead of `WALK_SPEED`. |
| `sit` | prop (chair, sofa, bed) | yes | 1.0, 3.0, 10.0 | Lowers to a seated pose on the prop's seat height, holds, and stands at the end. The seat height comes from a `PropDef.seatY?: number`. A prop without `seatY` is an `unknown_target` issue, with the message `cannot sit on <type>`. |
| `sleep` | none | no | 1.5, 3.0, 10.0 | Head droops, eyes shut; overlay draws "z" letters rising. |
| `fall_down` | none | no | 1.2, 1.8, 3.0 | Topples back to the ground and gets up. Stays inside the motion gate. |
| `type_laptop` | prop (desk) | yes | 1.0, 2.5, 8.0 | Both hands at desk height, fingers tapping. Works with the existing desk. |
| `read_book` | none | no | 1.0, 2.5, 8.0 | Overlay draws an open book held in both hands at chest height. |
| `phone_call` | none | no | 1.0, 2.5, 10.0 | Near hand at the ear; overlay draws a phone in that hand. |
| `drink` | none | no | 1.0, 1.8, 3.0 | Near hand lifts a cup to the mouth; overlay draws the cup. |
| `push` | prop/cast | yes | 0.8, 1.5, 3.0 | Both arms extend toward the target. |
| `knock` | prop (door) | yes | 0.8, 1.2, 2.5 | Near fist taps the target twice. |
| `dance` | none | no | 1.5, 3.0, 8.0 | Alternating arm swings with a hip sway, feet stepping in place. |
| `hug` | cast | yes | 1.0, 2.0, 4.0 | Arms wrap forward around the target position. One-sided: the other character does not need to act. |

Reach rule:
- `trackPositions(scene, catalog): Array<Map<string, number>>` returns each character's x at the start of every beat. It uses the same walk/run resolution the solver uses (Task 1 of plan 2), so the solver and the validator cannot disagree.
- For each action with `contact: true`, the validator reports `out_of_reach` at the action's path when `|actorX − resolvedTargetX| > REACH`. The target x for a prop is `propX`, and for a cast member it is their tracked x. An earlier `walk_to` or `run_to` in the same beat counts, because sequential actions are applied in order.

Prompt `screenplay@3` adds these rules:
- Contact actions (list them from the catalog via a `(chạm)` tag that `catalogText` prints when `contact: true`) need a `walk_to` or `run_to` to the target first.
- `sit` only works on chair, sofa or bed.
- Hand-held objects come with their action: do not add props for them.

- [ ] **Step 1: Write failing tests**
  - `validate.test.ts`:
    - `contact action at a far prop → out_of_reach`.
    - `walk_to then type_laptop in the same beat is fine`.
    - `walk_to in an earlier beat is remembered`.
    - `sit on a desk → unknown_target "cannot sit on desk"`.
  - `solve.test.ts`: `run_to is sized by run speed: 190/200 s clamped to min 0.6 → 0.95`.
  - `overlay.test.ts`:
    - `phone_call overlay draws near the near hand for facing 1 and -1`. Render one frame per facing and assert ink pixels within 12 units of `jointWorld(pose,'hF',…)`.
    - `overlay is called with deterministic t`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement the types, the stage helper, validate, solve and director changes, then the actions. Preview each action, viewing PNGs with `--prop chair`/`--prop desk`/`--prop door` where relevant (props from Task 6). Until Task 6 lands, a chair and a door do not exist, so build `sit` and `knock` against the existing `desk` in tests and re-preview after Task 6.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS, with every new action clean in the library gate.
- [ ] **Step 5: Commit.** Message: `feat(library): locomotion, contact and hand-held actions; reach rule`.

### Task 6: Props and backdrops — the everyday world

**Files:**
- Create: `packages/library/src/props/<id>.ts` × 10 and `packages/library/src/backdrops/<id>.ts` × 6
- Modify: `catalog.ts`, `types.ts` (`PropDef.seatY?: number`, which Task 5 consumes; if Task 5 added it already, reuse it)
- Test: `packages/library/test/bounds.test.ts` (new; uses @napi-rs/canvas, so put it in `packages/render/test/` if library has no canvas dependency)

Props (base at y = 0, width in world units):

| id | width | seatY | description |
|---|---|---|---|
| `chair` | 34 | −30 | Simple wooden chair, side view. |
| `sofa` | 90 | −28 | Two-seat sofa with cushions. |
| `bed` | 110 | −32 | Bed with pillow and blanket, side view. |
| `table` | 70 | — | Small round-top table on one stem. |
| `door` | 44 | — | Closed door in a frame with a knob. |
| `tree` | 70 | — | Leafy tree with a trunk. |
| `bookshelf` | 60 | — | Shelf with rows of book spines. |
| `box` | 40 | — | Cardboard box with flaps. |
| `lamp` | 30 | — | Standing floor lamp with a shade. |
| `plant` | 30 | — | Potted plant with leaves. |

Backdrops (faint, behind everything, like `classroom`): `home` (window with curtains, picture frame), `office` (window blinds, wall clock, calendar), `street` (building silhouettes, a lamp post far back), `park` (distant trees, sun, a bench outline), `cafe` (menu board, pendant lamps, counter line), `stage` (curtains at both sides, a spotlight cone). The existing ones are `blank` and `classroom`, which makes 8 in total (spec §7.2).

- [ ] **Step 1: Write the failing bounds test.** `bounds.test.ts` has two parts:
  - For every prop: draw it alone at x = 0 on a transparent canvas through the stage transform. Assert that all non-transparent pixels lie within world x ∈ [−width/2 − 3, width/2 + 3] and y ∈ [−185, 1]. Also assert that at least 1% of the box is inked.
  - For every backdrop: assert all ink lies within x ∈ [−150, 150] and y ∈ [−185, 0], and that it is "faint": no pixel darker than `rig.C.faint`/`C.muted` luminance, so characters stay readable. Use the stage transform values from `packages/render/src/layout.ts`.
- [ ] **Step 2: Run the test.** Expected: FAIL, because the new ids are missing.
- [ ] **Step 3: Implement.** Implement all 16 files. Preview each prop with `npm run preview -- think --prop <id> --target near:<id>` and view the PNGs. After that, re-preview `sit` on chair, sofa and bed, and `knock` on door, from Task 5.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(library): 10 props and 6 backdrops`.

### Task 7: Pacing gate

**Files:**
- Create: `packages/render/src/pacing.ts`
- Modify: `packages/render/src/index.ts`, `scripts/lib/motion-gate.ts` (run both gates; `--skip-motion` skips both)
- Test: `packages/render/test/pacing.test.ts`

**Interfaces:** `checkPacing(tl: Timeline, maxIdle = 2.5): { kind: 'idle'; start: number; end: number }[]` returns idle gaps longer than `maxIdle`. An idle moment is one where no track is active and no line is being spoken. The check runs from the end of the first beat to the last scene's `end − SCENE_TAIL`.

- [ ] **Step 1: Write failing tests.** Three tests:
  - `phan-so example has no idle gaps`.
  - `a hand-built timeline with a 3 s empty beat is flagged with its start/end`.
  - `exactly 2.5 s is allowed`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement it. The CLI prints `pacing idle <start>-<end>s` lines and exits 3, like motion findings.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(render): pacing gate (no idle > 2.5 s)`.

### Task 8: Sound — synthesised SFX cues and the final mix with optional licensed music

**Files:**
- Create: `packages/render/src/sfx.ts`, `packages/render/src/mix.ts`, `scripts/lib/music.ts`
- Modify: `packages/library/src/types.ts` (`ActionDef.sfx?: (dur: number) => { id: SfxId; at: number }[]`, with `at` in seconds from the action start), and the actions that make sound:
  - `walk_to`/`run_to`: `step` at each footfall, derived from the same gait period the rig uses.
  - `clap`: `clap` at each hand meet.
  - `cheer`: `pop` at the peak.
  - `jump`: `whoosh` at take-off, `thud` at landing.
  - `fall_down`: `thud` at impact.
  - `knock`: `knock` × 2.
  - `think`/`scratch_head`: `ting` at 40%.
- Modify: `scripts/make-film.ts` and `scripts/lib/render-steps.ts` (make uses `mixFilm`; render-film keeps `muxAudio`), `packages/core` (`run.json` `music` field type, if a type exists)
- Test: `packages/render/test/sfx.test.ts`, `packages/render/test/mix.test.ts`, `scripts/make-film.test.ts`

**Interfaces:**
- `SFX_IDS = ['step', 'pop', 'whoosh', 'ting', 'thud', 'clap', 'knock'] as const`, `type SfxId`.
- `ensureSfx(id: SfxId, cacheDir: string, opts?: { ffmpegPath?: string }): Promise<string>` generates it once with ffmpeg and returns the wav path. Each id is a fixed filter expression, so the bytes are identical across runs. Durations:
  - `step` 0.08 s: filtered-noise tick.
  - `pop` 0.12 s: a sine sweep from 900 Hz down to 300 Hz with an exponential decay.
  - `whoosh` 0.35 s: band-passed noise with a rise/fall envelope.
  - `ting` 0.6 s: a 1760 Hz sine plus a quiet 3520 Hz overtone, with a decay.
  - `thud` 0.25 s: a 70 Hz sine plus low noise, with a fast decay.
  - `clap` 0.1 s: a noise burst.
  - `knock` 0.12 s: 180 Hz plus noise, with a fast decay.
- `sfxCues(tl: Timeline, catalog: Catalog): { id: SfxId; start: number }[]`. It is deterministic, sorted by start, and contains every action's `sfx(dur)` offset by the track start. Clamp cues to the film duration.
- `mixFilm(videoPath, { voice: AudioClip[]; sfx: { path: string; start: number }[]; music?: string }, outPath, opts?): Promise<void>`. It applies the Global Constraints levels, ducking and loudnorm. The output length equals the video length: pad audio that is too short, and trim music that is too long (`-shortest` against the video). It has the same `outPath !== videoPath` guard as `muxAudio`.
- `readMusic(file: string): { path: string; license: { title: string; author: string; license: string; source: string } }` reads and validates the sidecar. It throws `CliError(1, '<file>.license.json: missing "<field>"')`.
- CLI: `make --music <file>`. The check runs at startup, before any LLM call.

- [ ] **Step 1: Write failing tests**
  - `sfx.test.ts`:
    - `ensureSfx is byte-identical across two generations` (delete the cache in between).
    - `each id has the stated duration ±10 ms` (use `wavSeconds`).
    - `sfxCues of a walk_to solo has one step per footfall, inside the track`.
  - `mix.test.ts`:
    - `voice-only mix integrates to -14 ±1 LUFS`. Measure with `ffmpeg -af ebur128` and parse `I:`.
    - `music longer than the video is trimmed to video length ±0.05 s`.
    - `no voice, no sfx, no music still produces a file of video length` (Review Focus 3).
    - `refuses outPath === videoPath`.
  - `make-film.test.ts`:
    - `--music without sidecar exits 1 naming the license file, before any LLM call`. The FakeLlm queue stays unconsumed; `STICK_FAKE_EMPTY=1` proves it.
    - `--music with sidecar records run.json.music`.
    - `--fake film has an audio stream at -14 ±1.5 LUFS`.
  - Synthesise a 30 s test music file with ffmpeg in the test temp dir. No downloaded media in tests or the repo.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Implement it. SFX are synthesised into `out/.sfx-cache`, next to `.tts-cache`.
- [ ] **Step 4: Run the full suite.** Run `npm test && npm run typecheck`, then `npm run make -- "Phân số là gì?" --fake --fresh --out out/sound-check`. Expected: exit 0. Report the measured loudness, then delete `out/sound-check`.
- [ ] **Step 5: Commit.** Message: `feat(render): synthesised SFX cues and loudness-normalised mix with licensed music`.

---

## Not in this plan (deliberate)

- **Persistent postures** (stay seated across beats), **two-role actions** (`give`/`receive` with both actors), and **emotions as a separate layer**: these need engine work. They are recorded as shortcuts in the code.
- **Whisper alignment and semantic captions** (spec step 5): plan 4 or later, once a live TTS provider is chosen. Today the captions page by width.
- **LLM-vision QA on the contact sheet** (spec step 9b): needs a working API key and belongs with the review UI in plan 4. The contact sheet built here is its input.
- **The live API run**: still blocked on a valid `ANTHROPIC_API_KEY`. The first live `npm run make` should happen as soon as the key works, before prompt tuning.
