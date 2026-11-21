# Stick Studio — Plan 1: Engine & Render Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a hand-written screenplay JSON (spec §7.3) plus per-line audio durations into a vertical 1080×1920 MP4 of stick figures acting it out, with burned-in Vietnamese captions, from one CLI command.

**Architecture:** npm-workspaces TypeScript monorepo. `core` holds the DSL schema and timeline types; `engine` loads the forked stick-scene rig in Node on `@napi-rs/canvas`; `library` holds verified actions, props and backdrops; `pipeline` validates screenplays and solves timelines (pure, no I/O); `render` has the director (timeline + t → drawn frame), the ffmpeg video writer, the motion checker and audio mixing. A script wires them together.

**Tech Stack:** Node 24, TypeScript 5 (strict, ESM), npm workspaces, zod 3, @napi-rs/canvas, vitest, tsx, ffmpeg 9 (system binary), opentype.js (dev, font coverage test).

**Spec:** `docs/superpowers/specs/2026-11-21-stick-studio-design.md`

**Scope of this plan:** The first of several plans. It covers P0 (prove Node-canvas render, Vietnamese font) and the engine/render half of P1. Later plans: (2) LLM + TTS + align pipeline steps, (3) DB + API + worker, (4) web UI, (5) full starter library and workshop.

## Deviations from the spec, decided while planning

- **npm workspaces instead of pnpm.** corepack's pnpm is broken on this machine and npm ships with Node 24. This changes no architecture.
- **Captions are drawn on the canvas by the renderer, not burned in by ffmpeg ASS.** The local ffmpeg 9.0.2 has no `subtitles`/`ass` filter (no libass), and drawing captions on the canvas keeps one font and one code path for preview and render.
- **Font: Patrick Hand (OFL), registered under the family name `Balsamiq Sans`.** Balsamiq Sans has no Vietnamese subset. The alias lets the vendored runtime's `FONT()` pick it up unchanged.

## Global Constraints

- Output: 1080×1920, 30 fps, H.264 `yuv420p`, MP4.
- World units follow the upstream runtime: ground `y = 0`, up is negative, `x = 0` is the centre, a standing figure is ~112 units tall, arm reach ~37 units from the shoulder.
- The vendored runtime algorithms stay byte-identical to upstream `runtime/stick.js` lines 1–932 (rig + kit). Keep upstream `LICENSE` (MIT © Kamran Ahmed) next to it.
- Rendering is deterministic. The same timeline gives the same pixels. Use no `Math.random` and no wall-clock time in draw paths.
- Ink `#141414`, paper `#ffffff`, the floor band uses the runtime's `C.floor`.
- No code executes from outside `packages/library` at render time (spec §4 invariant: only verified components reach a film).
- Strict TypeScript, no `any` in exported signatures. Functions under 50 lines, files under 400 lines.

## Review Focus

1. **A Vietnamese caption too long for one line** should wrap to at most 2 lines and shrink down to a minimum of 44 px before overflowing, never run off-frame. Test in Task 7.
2. **A beat whose line has no entry in the durations file** should get an estimated duration (`max(1.0, words × 0.33)` seconds) instead of 0 or a crash. Test in Task 5.
3. **`near:<propId>` pointing at a prop the scene doesn't have** should give a validation issue `unknown_target`, not an undefined x. Test in Task 4.
4. **ffmpeg missing or dying mid-stream** should reject with an error that includes the last stderr lines, and delete the partial output file. Test in Task 8.
5. **An action for a character with no start mark in that scene** should give the validation issue `not_on_stage`. Test in Task 4.

---

## File Structure

```
package.json                      # workspaces, scripts: test, typecheck, render
tsconfig.base.json
vitest.config.ts
assets/fonts/PatrickHand-Regular.ttf, OFL.txt
examples/phan-so.screenplay.json, phan-so.durations.json
scripts/render-film.ts            # CLI
packages/core/src/screenplay.ts   # zod DSL schema + parseScreenplay
packages/core/src/timeline.ts     # Timeline types + beatId()
packages/core/src/index.ts
packages/engine/src/vendor/stick-rig.js   # upstream lines 1–932, verbatim
packages/engine/src/vendor/LICENSE
packages/engine/src/rig.ts        # loadRig({ instrument? })
packages/engine/src/fonts.ts      # registerFonts()
packages/library/src/types.ts     # ActionDef, PropDef, BackdropDef, Catalog
packages/library/src/actions/{walk-to,point-at,think,cheer,wave,nod,talk}.ts
packages/library/src/props/{whiteboard,desk}.ts
packages/library/src/backdrops/{blank,classroom}.ts
packages/library/src/catalog.ts   # defaultCatalog
packages/pipeline/src/validate.ts # validateScreenplay
packages/pipeline/src/solve.ts    # solveTimeline, estimateLineDuration
packages/render/src/layout.ts     # frame + stage constants, markX
packages/render/src/director.ts   # sceneStateAt, drawFrame
packages/render/src/captions.ts   # layoutCaption, drawCaption
packages/render/src/video.ts      # renderVideo (ffmpeg pipe)
packages/render/src/audio.ts      # muxAudio
packages/render/src/motion.ts     # checkMotion
```

Each package has `package.json` (`"type": "module"`, `name: "@stick/<pkg>"`, `exports: "./src/index.ts"`) and tests in `packages/<pkg>/test/*.test.ts`. TS is run directly by `tsx` and vitest, with no build step in this plan.

---

### Task 1: Monorepo scaffold + screenplay DSL schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore` (`node_modules`, `out/`, `*.mp4`)
- Create: `packages/core/{package.json,src/screenplay.ts,src/timeline.ts,src/index.ts}`
- Test: `packages/core/test/screenplay.test.ts`

**Interfaces:**
- Produces:
  - `type Mark = 'left' | 'center' | 'right' | \`near:${string}\``
  - `ScreenplaySchema` (zod). `type Screenplay = z.infer<typeof ScreenplaySchema>`. Shape is exactly spec §7.3: `version: 1`, `format: { aspect: '9:16', fps: 30 }`, `title?: string`, `cast: { id, name, look: { ink: hex, hair?: 'short'|'long'|'ponytail'|'none' }, voice: string }[]` (1–4), `scenes: { id, backdrop, props: { id, type, mark }[], start: Record<castId, Mark>, beats: Beat[] (min 1) }[]` (min 1)
  - `Beat = { say?: { who, text (1–160 chars) }, do?: { who, action, target?: Mark | string, params?: Record<string, unknown> }[], camera?: { zoom: number (1–2), focus: Mark | string } }`. A beat must have `say` or `do`.
  - `parseScreenplay(input: unknown): { ok: true; value: Screenplay } | { ok: false; issues: string[] }`
  - In `timeline.ts`: `beatId(sceneId: string, index: number): string` → `` `${sceneId}.b${index}` ``, and the types `Timeline`, `TimedScene`, `TimedBeat`, `TimedAction`, `TimedLine`:
    ```ts
    interface TimedLine { who: string; text: string; start: number; end: number }
    interface TimedAction { who: string; action: string; target?: string; params: Record<string, unknown>; start: number; end: number }
    interface TimedBeat { id: string; start: number; end: number; line?: TimedLine; tracks: TimedAction[]; camera?: { zoom: number; focus: string } }
    interface TimedScene { id: string; start: number; end: number; backdrop: string; props: { id: string; type: string; mark: Mark }[]; start_marks: Record<string, Mark>; beats: TimedBeat[] }
    interface Timeline { fps: 30; width: 1080; height: 1920; duration: number; title?: string; cast: Screenplay['cast']; scenes: TimedScene[] }
    ```

- [ ] **Step 1:** `git init`. Write root `package.json` (`"private": true`, `"workspaces": ["packages/*"]`, scripts `test: vitest run`, `typecheck: tsc -p tsconfig.base.json --noEmit`). Install dev deps `typescript tsx vitest @types/node`, and `zod` in core.
- [ ] **Step 2: Write failing tests** in `screenplay.test.ts`:
  - `parses the spec example`: the §7.3 JSON (Minh/Lan, classroom, whiteboard) → `ok === true`, `value.scenes[0].beats.length === 2`.
  - `rejects landscape aspect`: `format.aspect: '16:9'` → `ok === false`, issues mention `format.aspect`.
  - `rejects a beat with neither say nor do` → `ok === false`.
  - `rejects 5 cast members` → `ok === false`.
  - `rejects a 161-character line` → `ok === false`.
  - `beatId('s1', 0) === 's1.b0'`.
- [ ] **Step 3:** Run `npx vitest run packages/core`. Expected: FAIL (module not found).
- [ ] **Step 4:** Implement the schema and `parseScreenplay`. Issues are formatted as `` `${path.join('.')}: ${message}` `` from `ZodError.issues`.
- [ ] **Step 5:** Run `npx vitest run packages/core && npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit `feat: monorepo scaffold and screenplay DSL schema`.

---

### Task 2: Engine, rig loaded in Node, Vietnamese font

**Files:**
- Create: `packages/engine/src/vendor/stick-rig.js` (copy upstream `runtime/stick.js` lines 1–932 verbatim from `github.com/nilbuild/stick-scene` at commit `ca84311`), `packages/engine/src/vendor/LICENSE` (upstream MIT)
- Create: `packages/engine/src/{rig.ts,fonts.ts,index.ts}`, `assets/fonts/PatrickHand-Regular.ttf`, `assets/fonts/OFL.txt` (from `github.com/google/fonts/tree/main/ofl/patrickhand`)
- Test: `packages/engine/test/rig.test.ts`, `packages/engine/test/fonts.test.ts`

**Interfaces:**
- Produces:
  - `type Rig = Record<string, any>` (the upstream `window.RIG` object; typed loosely at this boundary only), plus `type Pose = Record<'head'|'chest'|'hip'|'fF'|'fB'|'kF'|'kB'|'hF'|'hB', [number, number]> & { ef?: number; eb?: number; hang?: number }`
  - `loadRig(opts?: { instrument?: boolean }): Rig`. It evaluates the vendor source with `new Function('window', src)(shim)` and returns `shim.RIG`, with the shim attached as a non-enumerable `__shim` property. Each call returns a fresh instance, because `setSettle` holds module state. With `instrument: true` it injects the same recorder `scripts/motion.mjs` uses (text inserted before the first `'    return J;\n'`, pushing `{ x, y, s, sx, sh, handF, handB, eF, eB, hc, fF: p.fF, fB: p.fB, kF, kB, alpha, ink, bot, m }` to `shim.__rec` when it is an array). If the hook text isn't found it throws `Error('rig: cannot instrument fig()')`.
  - `registerFonts(): void`. It is idempotent and calls `GlobalFonts.registerFromPath(<repo>/assets/fonts/PatrickHand-Regular.ttf, 'Balsamiq Sans')`.
- Deps: `@napi-rs/canvas` in engine. `opentype.js` as a dev dep.
- Shortcut comment required in `rig.ts`: `// shortcut: vendor runs via new Function with a window shim, Node-only; the web preview (plan 4) loads it as a classic script.`

- [ ] **Step 1: Write failing tests:**
  - `rig.test.ts › draws a resting figure`: `loadRig()`, create a 380×230 canvas, `translate(190, 192)`, call `R.fig(g, R.breathe(R.P({ hF: [12,-60], hB: [-4,-52] }), 0), 0, 0)`. The pixel at canvas `(190, 192 - 102*0.88)` (head centre) has R,G,B all < 60.
  - `rig.test.ts › is deterministic`: the same draw twice on two canvases gives equal `toBuffer('image/png')`.
  - `rig.test.ts › instrument records joints`: `loadRig({ instrument: true })`, set `rig.__shim.__rec = []` (expose the shim as `__shim` on the returned rig), draw one fig → `__rec.length === 1` and `__rec[0].hc` is a 2-number array.
  - `fonts.test.ts › font covers Vietnamese`: load the TTF with opentype.js. For every char of `'ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ'` and its `toUpperCase()`, `font.charToGlyphIndex(ch) !== 0`.
  - `fonts.test.ts › registers alias`: after `registerFonts()`, `GlobalFonts.has('Balsamiq Sans') === true`.
- [ ] **Step 2:** Run `npx vitest run packages/engine`. Expected: FAIL.
- [ ] **Step 3:** Copy the vendor file and LICENSE, download the font and OFL.txt, implement `loadRig` and `registerFonts`. Resolve the asset path from `import.meta.url`.
- [ ] **Step 4:** Run `npx vitest run packages/engine`. Expected: PASS. If the coverage test fails, Patrick Hand lacks a glyph. Stop and report: the font choice goes back to the owner.
- [ ] **Step 5:** Commit `feat(engine): load stick rig in node with vietnamese font`.

---

### Task 3: Library types + starter actions, props, backdrops

**Files:**
- Create: `packages/library/src/{types.ts,catalog.ts,index.ts}`, `actions/{walk-to,point-at,think,cheer,wave,nod,talk}.ts`, `props/{whiteboard,desk}.ts`, `backdrops/{blank,classroom}.ts`
- Test: `packages/library/test/actions.test.ts`

**Interfaces:**
- Consumes: `Rig`, `Pose` (Task 2).
- Produces (`types.ts`):
  ```ts
  interface CharacterState { id: string; x: number; facing: 1 | -1 }
  interface ActionContext { rig: Rig; self: CharacterState; targetX?: number; k: number; T: number; dur: number; t: number; base: Pose }
  interface ActionResult { pose: Pose; x?: number; facing?: 1 | -1; gait?: { ph: number; amp: number; stride?: number } }
  interface ActionDef { id: string; version: number; needsTarget: boolean; duration: { min: number; ideal: number; max: number }; description: string; apply(ctx: ActionContext): ActionResult }
  interface PropDef { id: string; version: number; width: number; description: string; draw(g: CanvasRenderingContext2D, rig: Rig, x: number, t: number): void }
  interface BackdropDef { id: string; version: number; description: string; draw(g: CanvasRenderingContext2D, rig: Rig, t: number): void }
  interface Catalog { actions: Record<string, ActionDef>; props: Record<string, PropDef>; backdrops: Record<string, BackdropDef> }
  ```
  - `defaultCatalog: Catalog` with exactly these ids. Actions: `walk_to` (needsTarget, `{0.6, 1.2, 3.0}`), `point_at` (needsTarget, `{0.5, 0.8, 1.5}`), `think` (`{0.8, 1.5, 3.0}`), `cheer` (`{0.6, 1.0, 2.0}`), `wave` (`{0.6, 1.0, 2.0}`), `nod` (`{0.4, 0.6, 1.2}`), `talk` (`{0.3, 1.0, 30}`, the implicit gesture while speaking). Props: `whiteboard` (width 90), `desk` (width 80). Backdrops: `blank`, `classroom`.
- Poses come from `references/craft.md` "Poses" table (rest, chin/think, point ahead, cheer). Blend with `rig.mix` and `rig.E.soft(rig.seg(...))`, never a bare switch. Every action returns to the rest pose at `k = 1`, except `walk_to`, whose result keeps `x = targetX`. `walk_to` uses `rig.walkSeg(T, 0, dur, self.x, targetX)`, sets `facing` toward the target, and returns `gait` with stride.
- Prop and backdrop drawings use only kit pen helpers (`rr`, `inkFill`, `ln`, `words`, `stand`, `text`). Keep everything above `y = -185` and within `±150`.

- [ ] **Step 1: Write failing tests** (`actions.test.ts`), each run over every action in `defaultCatalog`:
  - `returns to rest at k=1`: for every non-`walk_to` action, `apply({k:1, T:dur, ...}).pose.hF` is within 1 unit of `ctx.base.hF`.
  - `starts at rest at k=0`: for every action, `pose.hF` at `k=0` is within 1 unit of `base.hF`.
  - `walk_to arrives`: `self.x = -95`, `targetX = 50`, `dur = 1.2`, at `T = 1.2` → `x === 50` and `facing === 1`. At `T = 0.6`, `-95 < x < 50`.
  - `catalog ids are exact`: sorted action ids equal `['cheer','nod','point_at','talk','think','walk_to','wave']`.
  - `props and backdrops draw without throwing` on a 380×230 canvas.
- [ ] **Step 2:** Run `npx vitest run packages/library`. Expected: FAIL.
- [ ] **Step 3:** Implement the types, the 7 actions, 2 props, 2 backdrops and the catalog.
- [ ] **Step 4:** Run `npx vitest run packages/library`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(library): starter actions, props and backdrops`.

---

### Task 4: Semantic validation

**Files:**
- Create: `packages/pipeline/src/{validate.ts,index.ts}`
- Test: `packages/pipeline/test/validate.test.ts`

**Interfaces:**
- Consumes: `Screenplay` (Task 1), `Catalog` (Task 3).
- Produces:
  - `type IssueCode = 'unknown_action' | 'unknown_prop' | 'unknown_backdrop' | 'unknown_cast' | 'unknown_target' | 'missing_target' | 'not_on_stage' | 'mark_collision'`
  - `interface Issue { code: IssueCode; path: string; message: string; key?: string }`. `key` holds the missing library key for `unknown_*` library codes (it feeds `library_request` in plan 2).
  - `validateScreenplay(sp: Screenplay, catalog: Catalog): Issue[]`. An empty array means valid.
- Rules:
  - every `who` and every `start` key is in `cast`;
  - `action`, `props[].type` and `backdrop` exist in the catalog;
  - `needsTarget` actions have a `target`;
  - a target is a `Mark`, a prop id in that scene, or a cast id;
  - `near:<id>` refers to a prop in that scene;
  - every character used in a scene's beats has a start mark there (`not_on_stage`);
  - no two characters share a start mark (`mark_collision`).
  - `path` looks like `scenes.0.beats.1.do.0.action`.

- [ ] **Step 1: Write failing tests:** the spec example → `[]`. Then one test per code, each mutating the example once and asserting exactly one issue with that code, the expected `path`, and (for `unknown_action` with action `ride_bike`) `key === 'ride_bike'`. Review Focus #3: target `near:door`, no `door` prop → `unknown_target`. Review Focus #5: `lan` acts in a scene where `start` lacks `lan` → `not_on_stage`.
- [ ] **Step 2:** Run `npx vitest run packages/pipeline`. Expected: FAIL.
- [ ] **Step 3:** Implement `validateScreenplay`.
- [ ] **Step 4:** Run `npx vitest run packages/pipeline`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pipeline): semantic screenplay validation`.

---

### Task 5: Timeline solver

**Files:**
- Create: `packages/pipeline/src/solve.ts`
- Test: `packages/pipeline/test/solve.test.ts`

**Interfaces:**
- Consumes: `Screenplay`, `Timeline` types, `beatId` (Task 1), `Catalog` (Task 3). It assumes `validateScreenplay` returned `[]`.
- Produces:
  - `solveTimeline(sp: Screenplay, lineDurations: Record<string, number>, catalog: Catalog): Timeline` (keys are `beatId`s)
  - `estimateLineDuration(text: string): number` = `Math.max(1.0, words * 0.33)`, where `words = text.trim().split(/\s+/).length`
  - Exported constants: `LINE_LEAD = 0.15`, `BEAT_PAD = 0.3`, `MIN_BEAT = 0.8`, `SCENE_TAIL = 0.4`
- Algorithm (pins the behaviour, implementer writes it):
  ```
  for each beat:
    lineDur = lineDurations[id] ?? (say ? estimateLineDuration(say.text) : 0)
    per character c: seq_c = its `do` actions in order; ideal_c = Σ ideal
    beatLen = max(say ? lineDur + LINE_LEAD + BEAT_PAD : 0, max_c ideal_c, MIN_BEAT)
    per c: f = beatLen / ideal_c; dur_i = clamp(ideal_i * f, min_i, max_i); pack from beat start
    line (if say) = [beatStart + LINE_LEAD, beatStart + LINE_LEAD + lineDur]
  scene.end = last beat end + SCENE_TAIL; scenes and beats are back to back; timeline.duration = last scene end
  ```

- [ ] **Step 1: Write failing tests:**
  - `stretches actions to fit the line`: beat `s1.b1` has line duration 2.0 and Lan `walk_to` (ideal 1.2) then `point_at` (ideal 0.8) → beat length `2.45`, walk `[b, b+1.47]`, point `[b+1.47, b+2.45]` (`toBeCloseTo(_, 2)`).
  - `line-only beat`: line 1.0 → beat length `1.45`, line `[b+0.15, b+1.15]`.
  - `clamps to max then holds`: line 10.0 with one `nod` (max 1.2) → nod length `1.2`, beat length `10.45`.
  - `missing duration is estimated` (Review Focus #2): no entry for a 6-word line → line length `toBeCloseTo(1.98, 2)`.
  - `scenes are contiguous`: `scenes[1].start === scenes[0].end`, and `duration === scenes.at(-1).end`.
- [ ] **Step 2:** Run `npx vitest run packages/pipeline/test/solve.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(pipeline): deterministic timeline solver`.

---

### Task 6: Layout + director

**Files:**
- Create: `packages/render/src/{layout.ts,director.ts,index.ts}`
- Test: `packages/render/test/director.test.ts`

**Interfaces:**
- Consumes: `loadRig`, `registerFonts` (Task 2), `Catalog`, `CharacterState` (Task 3), `Timeline` (Task 1).
- Produces:
  - `layout.ts` constants: `FRAME = { w: 1080, h: 1920 }`, `STAGE = { worldWidth: 300, scale: 3.6, groundY: 1250 }`, `TITLE = { y: 300, size: 64 }`, `CAPTION = { cx: 500, y: 1450, maxWidth: 780, size: 60, minSize: 44, maxLines: 2 }`, `MARK_X = { left: -95, center: 0, right: 95 }`, `NEAR_OFFSET = 45`
  - `markX(mark: Mark, scene: TimedScene, fromX?: number): number`. `near:<prop>` resolves to prop x `- NEAR_OFFSET` when `fromX` is `undefined` or `<= propX`, else `+ NEAR_OFFSET`.
  - Resolving an action `target` to `targetX`: a `Mark` uses `markX`. A bare prop id behaves like `near:<id>` for `walk_to` and gives the prop's own x for every other action. A cast id gives that character's current x, `∓ NEAR_OFFSET` for `walk_to` with the same side rule.
  - `sceneStateAt(tl: Timeline, t: number, rig: Rig, catalog: Catalog): { scene: TimedScene; chars: Array<CharacterState & { pose: Pose; gait?: ActionResult['gait'] }>; zoom: number; focusX: number }`. Positions persist: each character starts at its start mark, and a finished `walk_to` leaves it at the target. A character with a live line and no action gets `talk` applied. The camera zoom eases from 1 to `camera.zoom` over the first 0.5 s of a beat and holds until a beat without camera, then eases back to 1 over 0.5 s.
  - `drawFrame(g: SKRSContext2D, tl: Timeline, t: number, rig: Rig, catalog: Catalog): void`. Order: paper fill → floor band below `groundY` → ground line → under the stage transform (translate to `(540, groundY)`, scale `3.6 × zoom` around focus): backdrop → props → figures (`rig.fig(g, legs(pose,…), x, 0, { sx: facing, ink: look.ink })`) → title (scene 0 only, if `tl.title`) → caption (Task 7; call `drawCaption` once Task 7 exists, a no-op stub until then).
  - Call `rig.setSettle(1)` before figures each frame, so `pulse` never reads stale state.

- [ ] **Step 1: Write failing tests** using the solved spec example (Task 5, durations `{ 's1.b0': 1.6, 's1.b1': 2.0 }`):
  - `start marks`: at `t = 0`, Minh `x === -95`, Lan `x === 0`.
  - `walk persists`: at the end of `s1.b1`, Lan's x equals `markX('near:board', scene, 0)`, which is `95 - 45 = 50`.
  - `mid-walk`: halfway through Lan's walk, `0 < x < 50`.
  - `talk while speaking`: at the middle of Minh's line in `s1.b0` with no action → his pose differs from the rest pose (some hand > 1 unit away).
  - `zoom eases`: zoom at `s1.b1.start + 0.25` is strictly between 1 and 1.3, and at `+0.6` it equals 1.3.
  - `drawFrame is deterministic`: two 1080×1920 canvases at `t = 2.0` give equal PNG buffers. The pixel at the ground line `(540, 1250)` is dark.
- [ ] **Step 2:** Run `npx vitest run packages/render/test/director.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `layout.ts` and `director.ts`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(render): director draws timeline frames`.

---

### Task 7: Captions

**Files:**
- Create: `packages/render/src/captions.ts`. Modify: `director.ts` (replace the stub call).
- Test: `packages/render/test/captions.test.ts`

**Interfaces:**
- Consumes: `CAPTION` (Task 6).
- Produces:
  - `layoutCaption(g: SKRSContext2D, text: string): { lines: string[]; size: number }`. Greedy word wrap at `CAPTION.maxWidth`, measured with `g.measureText` in the `Balsamiq Sans` family. Try `size` from 60 down to 44 in steps of 2 until it fits in ≤ 2 lines. At 44, if it still doesn't fit, keep 2 lines and end the second with `…`.
  - `drawCaption(g, text, t, lineStart, lineEnd): void`. It draws only when `lineStart ≤ t < lineEnd`: a white rounded box with 1.5 px ink stroke, 24 px padding, ink text centred at `CAPTION.cx`, baseline block centred on `CAPTION.y`. Fade in and out over 0.12 s.

- [ ] **Step 1: Write failing tests** (after `registerFonts()`):
  - `short line stays one line at 60`: `'Lan ơi, phân số là gì vậy?'` → `{ lines.length: 1, size: 60 }`.
  - `long line wraps` (Review Focus #1): a 30-word Vietnamese sentence → `lines.length <= 2`, every `measureText(line).width <= 780` at the returned size, and `size >= 44`.
  - `overflow is ellipsized`: a 120-word sentence → `lines.length === 2`, `size === 44`, `lines[1].endsWith('…')`.
  - `draws nothing outside its window`: at `t = lineEnd`, the canvas region around `(500, 1450)` stays its prior colour.
- [ ] **Step 2:** Run `npx vitest run packages/render/test/captions.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, and wire `drawCaption` into `drawFrame` for the active `TimedLine`.
- [ ] **Step 4:** Run `npx vitest run packages/render`. Expected: PASS (director tests too).
- [ ] **Step 5:** Commit `feat(render): vietnamese captions drawn on canvas`.

---

### Task 8: Video writer + audio mux

**Files:**
- Create: `packages/render/src/{video.ts,audio.ts}`
- Test: `packages/render/test/video.test.ts`

**Interfaces:**
- Consumes: `drawFrame` (Task 6), `FRAME` (Task 6).
- Produces:
  - `renderVideo(tl: Timeline, outPath: string, opts?: { ffmpegPath?: string; catalog?: Catalog; onProgress?: (frame: number, total: number) => void }): Promise<{ frames: number; seconds: number }>`. It spawns `ffmpeg -y -f rawvideo -pix_fmt rgba -s 1080x1920 -r 30 -i - -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium <out>` and writes `ceil(duration × 30)` frames, frame `i` at `t = i / 30`, from one reused canvas using `canvas.data()` (raw RGBA). It respects stdin backpressure (`await once(stdin, 'drain')` when `write` returns false). On a non-zero exit or spawn error, it rejects with `Error` whose message contains the last 20 stderr lines, and `rm -f` the partial file. `seconds` is the wall time, which is logged by the CLI as render fps (the P0 speed metric).
  - `muxAudio(videoPath: string, clips: { path: string; start: number }[], outPath: string, opts?: { ffmpegPath?: string }): Promise<void>`. It uses `adelay` per clip (ms, all channels) + `amix=inputs=N:normalize=0`, then `-c:v copy -c:a aac -b:a 160k -shortest`. With zero clips it copies the video unchanged.

- [ ] **Step 1: Write failing tests** (use `os.tmpdir()`; run `ffprobe -v error -show_entries stream=width,height:format=duration -of json`):
  - `renders a 2-scene film`: the solved spec example → mp4 exists, width 1080, height 1920, duration within ±0.1 s of `tl.duration`.
  - `fails loudly without ffmpeg` (Review Focus #4): `ffmpegPath: '/nonexistent/ffmpeg'` → rejects, and the output file does not exist afterwards.
  - `muxes audio at offsets`: generate a 1 s sine with `ffmpeg -f lavfi -i sine=f=440:d=1 tone.wav`, mux it at `start: 0.5` → ffprobe shows one audio stream, and the duration equals the video's ±0.1 s.
- [ ] **Step 2:** Run `npx vitest run packages/render/test/video.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `renderVideo` and `muxAudio` with `node:child_process` `spawn` (no shell, args as an array).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(render): ffmpeg video writer and audio mux`.

---

### Task 9: Motion checker + library gate

**Files:**
- Create: `packages/render/src/motion.ts`
- Test: `packages/render/test/motion.test.ts`, `packages/library/test/motion-gate.test.ts`

**Interfaces:**
- Consumes: `loadRig({ instrument: true })` (Task 2), `sceneStateAt`, `drawFrame` (Task 6).
- Produces:
  - `type MotionKind = 'jump' | 'arm-through-face' | 'head-covered' | 'bent-back-elbow' | 'elbow-out-back' | 'squash' | 'skate'`
  - `checkMotion(tl: Timeline, catalog: Catalog, opts?: { fps?: number /*60*/ }): Array<{ kind: MotionKind; from: number; to: number; note: string }>`. It draws every frame at `fps` onto a 1080×1920 canvas with the instrumented rig, collects `__rec`, and applies **the same formulas and thresholds as upstream `scripts/motion.mjs` lines 157–225**: `jump` acc > 6 (world units, scaled back by the stage transform), arm-through-face via `segDist < HEAD_R - 1.5 / - 2.5`, elbow cross-product > 0.3, elbow-out-back, squash `0.05 < |sx| < 0.95`, skate > 1.2 per frame, `head-covered` by sampling 5 head pixels through the recorded transform `m`. Findings of the same kind within 0.12 s merge. `reach-short`, `start-pop` and `end-pop` are dropped: there is no idle-to-action boundary in a timeline film.
- `motion-gate.test.ts` is the CI gate from spec §13. Each action in `defaultCatalog` is played alone on a one-scene, one-beat timeline (target `right` for `needsTarget`, start `left`) at its ideal duration, and must yield `[]`.

- [ ] **Step 1: Write failing tests:**
  - `motion.test.ts › clean film`: the solved spec example → `[]`.
  - `motion.test.ts › detects a snap`: a test-only catalog whose action `snap` returns the rest pose for `k < 0.5` and the cheer pose for `k ≥ 0.5` (bare switch) → contains a finding with `kind === 'jump'`.
  - `motion-gate.test.ts › every starter action moves cleanly`, as described above.
- [ ] **Step 2:** Run `npx vitest run packages/render/test/motion.test.ts packages/library/test/motion-gate.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `checkMotion`. If the gate fails for an action, fix the action (Task 3 file), not the thresholds.
- [ ] **Step 4:** Run `npm test`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat(render): motion checker and library motion gate`.

---

### Task 10: CLI + example film

**Files:**
- Create: `scripts/render-film.ts`, `examples/phan-so.screenplay.json`, `examples/phan-so.durations.json`
- Modify: root `package.json` (script `"render": "tsx scripts/render-film.ts"`)
- Test: `scripts/render-film.test.ts`

**Interfaces:**
- Consumes: `parseScreenplay` (1), `defaultCatalog` (3), `validateScreenplay`, `solveTimeline` (4–5), `checkMotion`, `renderVideo`, `muxAudio` (8–9).
- Produces the CLI: `npm run render -- <screenplay.json> [--durations d.json] [--audio dir] [--out out/film.mp4] [--skip-motion]`.
  - `--audio dir`: optional files `<beatId>.wav`. Their ffprobe durations override `--durations`, and they are muxed at each line's `start`.
  - Exit codes: `0` ok; `1` usage or IO error; `2` schema or validation issues (printed one per line as `code path message`); `3` motion findings (printed, film not rendered unless `--skip-motion`).
  - On success it prints `out path`, `duration`, `frames` and `render fps`.
- Example film `phan-so` ("Phân số là gì?"): 3 scenes, Minh and Lan, `classroom`, `whiteboard`, `desk`, about 20–30 s total, using only the 7 starter actions. The durations file holds plausible per-line values (Vietnamese at ~3 words/s).

- [ ] **Step 1: Write failing tests** (spawn the CLI with `tsx`):
  - `renders the example`: exit 0, the output mp4 exists and is 1080×1920.
  - `reports validation issues`: a copy of the example with action `ride_bike` → exit 2, stdout contains `unknown_action`.
  - `usage error`: no args → exit 1.
- [ ] **Step 2:** Run `npx vitest run scripts`. Expected: FAIL.
- [ ] **Step 3:** Implement the CLI (`node:util` `parseArgs`) and write the example screenplay.
- [ ] **Step 4:** Run `npm test && npm run typecheck`. Expected: PASS. Then run `npm run render -- examples/phan-so.screenplay.json --durations examples/phan-so.durations.json --out out/phan-so.mp4` and extract frames at 1 s, 8 s and 15 s with ffmpeg. **Look at them**: figures are not cropped, captions are readable with correct Vietnamese diacritics, and nothing covers a face. Record the render fps in the commit message.
- [ ] **Step 5:** Commit `feat: render-film CLI and phan-so example (render N fps)`.

---

## Self-review notes

- Spec coverage for this plan's scope: §7.1 engine split (rig/kit vendored; camera, character look, director, vertical layout → Tasks 2, 6, 7), §7.2 library types and a starter subset (Task 3, the rest in plan 5), §7.3 DSL and semantic checks (Tasks 1, 4), §6 steps 3, 6, 7 and the video half of 8 (Tasks 4, 5, 8), §13 golden-determinism and motion gate (Tasks 6, 9), §14 P0 render-speed and font proof (Tasks 2, 8, 10). Out of scope here and owned by later plans: steps 1, 2, 4, 5, 9 (LLM/vision), 10, 11; DB/API/worker/web; workshop; budgets.
- `hair` in `look` is parsed but not drawn yet. Accessories come with the character work in plan 5. Characters are distinguished by `ink` colour only in this plan.
