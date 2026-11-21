# Plan 3: rulings and deferred follow-ups

Branch plan-3-film-quality, commits dee4ac4..a0133d6. 863 tests pass, typecheck clean. The live Claude API path is still unverified: the key in .env returns 401.

## Before the first live run
- Watch `path_blocked` and `mark_collision` in repair rounds. If they don't converge, loosen them, for example by allowing a pass-through when the passer's head stays clear.
- Gate findings (motion/pacing) still exit 3 after paid calls, with no repair. Consider feeding them into the repair loop.
- Loudness: SFX-only mixes land around -15.2 LUFS, because peaks force loudnorm into dynamic mode. Mixes with voice measure -14.0. If real films with many footsteps drift low, add a limiter before loudnorm.

## Before plan 4 (worker / concurrency)
- The SFX cache's fixed `.partial` file name can collide when two makes run at once. Add a pid or random suffix.
- loudnorm pass 1 runs `execFile` with no timeout, and its error message dumps the whole filtergraph. Add a timeout and trim the message to the stderr tail.

## Rulings
- | Pair/Task | Shared | Finding | Ruling |
- | T1 self | IssueCode missing_line→line_mismatch | prompts/repair & tests referencing missing_line must update | Ruling: T1 updates all refs — cost: none |
- | T5↔T6 | PropDef.seatY; sit/knock need chair/door from T6 | ordering | Ruling: T5 adds seatY to PropDef and sets it on no existing prop; sit tests use a test-local prop def with seatY; T6 sets seatY on chair/sofa/bed and re-previews sit/knock — cost: little |
- Task 1: implementer DONE_WITH_CONCERNS bf697fa. Ruling: pipeline→prompts runtime edge kept (plan's 'must not depend on prompts' line was my error; spec only bars concrete providers; graph now acyclic) — cost: none.
- Ruling: T5 overlays must use fig's returned J.w.handF/handB (director captures fig return), not jointWorld hF/hB — reviewer measured up to 14 units gap — cost: small director change
- Task 4: review Needs fixes (0.3s ramp contract broken in 10 actions; cry≈facepalm, shrug≈clap, laugh≈cross_arms). Ruling: minors 5–8 (clap, stomp, look_around legibility, shortcut comment) included in round — recognisability is the task's purpose. Fix round 1 sent (FIX_BASE 8b63338).
- Task 4: fix 0b99288. Ruling: snap test threshold 45% at 0.1 s (my 5% was impossible for a 0.3 s ramp; 45% still fails all 11 floor-removed cases) — cost: weaker snap net. Ruling: short-hop jump scales rise with airtime² — accepted.
- Task 4: fix 8c7e06d. Ruling: descriptions of clap/stomp/look_around updated to match the new poses (description must say what it looks like, per global constraint) — cost: none.
- Ruling: Task 5 split into 5a (infra: overlay+J capture, speed, trackPositions, out_of_reach, seatY, prompt screenplay@3, cry tears, run_to) and 5b (the other 11 actions) — T4 implementer hit 260k tokens on 12 actions — cost: one extra review cycle
- Task 5a: implementer DONE_WITH_CONCERNS 5182f0a. Ruling: reach measured to target surface (prop half-width; cast CAST_GAP−NEAR_GAP; marks 0), REACH stays 37 — centre distance after walk_to is 58–63 so literal rule unsatisfiable; spec's ~37 is hand reach — cost: a far-side touch of a very wide prop passes. Ruling: run_to durations 0.9/0.95/2.0 (gate-driven) accepted. Open risk: run_to flags at unprobed ~1.1/1.3 s → sent to review. Flaky: video.test.ts failed 1/5.
- Task 5a: fix ab3b52d. Ruling: run_to durations now 0.95/1.0/2.0 (gate-driven) accepted.
- Task 5b: review Needs fixes (drink cup tips away; knock flicks linger). Ruling: gate-at-true-max for hold actions upgraded to in-loop (global constraint says "at max"); overlay ink added; sleep "eyes shut" via droop+z accepted (no face). Fix round 1 sent (FIX_BASE 76bc9ca).
- Ruling: fold Minor 1 (bed asymmetry) and Minor 4 (descriptions leak "on the left") into the Important-1 fix — same change, splitting it costs a second round — cost if wrong: slightly larger fix diff
- Ruling: final fix wave covers C1, I2, I3 and Minors 4 (character on prop mark) and 6 (ffprobe --music) — all can cost a paid live run then exit; Minor 5 accepted as fake-mode behaviour — cost if wrong: one larger fix wave
- Ruling: I3 fixed by a validator issue (walk path crosses another on-stage character's position) plus a screenplay prompt rule, not just a prompt line — validator issues go through the repair loop before TTS/render spend, a prompt rule alone can be ignored — cost if wrong: stories where characters pass each other get repaired away

## Deferred minors (final review triage: all can wait)
- Task 1: minor (deferred): root package.json lacks zod pin though scripts import zod/v4
- Task 1: minor (deferred): graph test doesn't check undeclared @stick/* imports
- Task 2: minor (deferred): solo.ts exported publicly from render
- Task 2: minor (deferred): contact-sheet failure in make is warned+continued (not silent, retried next run)
- Task 2: minor (deferred): wave motion subtle — could strengthen in action work
- Task 3: minor (deferred): ponytail/long strokes thin (2.2) at phone size; jointWorld doc understates hand gap; duplicated rig constants
- Task 4: minor (deferred): catalog.test doesn't table-check exact descriptions/durations
- Task 4: minor (deferred): fists small in stomp; clap V not crisp; look_around flip instant
- Task 5a: minor (deferred): sit on nonexistent target reports two unknown_target issues
- Task 5a: minor (deferred): locomotion sweep tests only 95/190 units
- Task 5b: minor (deferred): push on cast passes hands through partner; hug open phase weak solo; sit slides up to 75u in ramp (bed)
- Deferred (5b minor): no test asserts finger overlays use a non-default ink
- Task 6: minor (deferred): backdrop bounds test has no minimum-ink floor
- Task 6: minor (deferred): seatY not read by renderer; sit uses fixed SEAT_HIP_Y
- Task 6: minor (deferred): preview CLI cannot target a prop id (sit/knock previews need a throwaway script)
- Task 6: minor (deferred): laptop now front-on (no keys/screen angle visible); contact test doesn't assert lid behind hands
- Task 6: minor (deferred): type_laptop pose leans far forward with legs trailing
- Task 7: minor (deferred): no test for trailing-idle path (close(to)); redundant Math.min in pacing.ts
- Task 8: minor (deferred): sparse SFX-only films can't reach -14 LUFS (TP ceiling); test comment overgeneralises
- Task 8: minor (deferred): loudnorm pass-1 execFile no timeout, error message dumps full filtergraph
- Task 8: minor (deferred): fixed .partial name in sfx cache can collide across concurrent runs
- Task 8: minor (deferred): music swap under unchanged sidecar undetected (could hash)
- Final fix: when the ffprobe binary is missing, --music says "no audio stream", which is misleading.
- Final fix: phone_call `version` was not bumped. Nothing reads the field yet.
- Final review M5: a --fake film is loud SFX only, because the fake voice is silent. Accepted.
- Final fix: the checkPath message says "walks through" even when the walk only stops within CAST_GAP.
