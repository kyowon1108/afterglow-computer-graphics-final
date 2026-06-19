# QA HANDOFF — AFTERGLOW Current State

Date: 2026-06-20
Scope: desktop browser only. Mobile/touch UI is intentionally out of scope.

The latest consolidated implementation spec is `docs/SPEC.md`. This document is
kept separate for QA status, verification snapshots, and user-reported findings.
It repeats a small amount of gameplay context so external QA can work without
opening every split markdown file first.

## 1. Project Summary

| Item | Current answer |
|---|---|
| Project | AFTERGLOW |
| Genre | Three.js + Vite desktop first-person light puzzle game |
| Core rule | Floor is walkable only when CPU-computed placed light / routed light reaches the threshold |
| Technical claim | CPU SurfelGI-style radiosity approximation, not DDGI and not physically exact SurfelGI |
| Main loop | Pick block -> place on socket -> aim/rotate light/mirror -> CPU solve -> walk lit path -> reach exact exit |
| Completion rule | Exact exit cell + all gates open + empty hands + grounded |
| Validation stance | Headless exhaustive validation, interaction smoke, report capture, and build are passing locally |

The important distinction for QA: the current build is structurally implemented
and passes automated contract tests. The first-3-minutes UX pass added Korean
onboarding, pointer-lock recovery, wheel-only object rotation, clearer HUD
guidance, and L1 step tutorial. Manual QA should now focus on regression checks,
visual polish, and whether L4/L5 read as satisfying puzzles.

## 2. Main Files

| Area | Files |
|---|---|
| Runtime bootstrap / game loop | `src/main.js` |
| Input and camera | `src/core/input.js`, `src/core/cameraRig.js` |
| Level data | `src/game/levels.js` |
| Win/path/socket rules | `src/game/rules.js` |
| CPU light solver | `src/gi/SurfelSolver.js`, `src/gi/sampleField.js`, `src/gi/applyGI.js` |
| Block visuals and previews | `src/entities/EmissiveBlock.js` |
| World and tile visuals | `src/world/levelBuilder.js`, `src/world/tileMesh.js`, `src/world/materials.js` |
| Headless QA scripts | `scripts/validate-levels.mjs`, `scripts/smoke-interactions.mjs`, `scripts/capture-report.mjs` |
| Design contracts | `docs/SPEC.md`, `docs/CONVENTIONS.md`, `docs/MECHANICS_v3.md`, `docs/LEVELS.md` |

## 3. Current Controls As Implemented

| Input | Current behavior |
|---|---|
| WASD / Arrow keys | Move |
| Mouse | First-person look through pointer lock; fallback drag-look if pointer lock fails |
| E / left click | Pick block or place held block on a matching socket |
| Mouse wheel / `[` / `]` | Rotate held block, otherwise rotate the aimed mirror |
| Q | Cycle held block color when not `colorLocked` |
| Z | Undo block/mirror command |
| R | Reset current level |
| G | Toggle GI/direct solve mode |
| B | Toggle DIRECT/BOUNCE1/BOUNCE2/FINAL debug view |
| M | Peek/top-like camera |
| T | Third-person robot camera |
| F1 / V / N | Debug overlays/views |
| Esc | Pause/title overlay behavior |

Placement snaps the held block's `emitDir` to the current camera facing once.
After placement, emitters and mirrors rotate only through mouse wheel or
`[` / `]`; mouse movement is look-only.

## 4. Gameplay Rules Currently Enforced

- Blocks can be placed only on sockets; free drop is not supported.
- Held/carry light is visual-only. It does not create walkable floor, open gates,
  feed mirrors, or count in validation.
- Placed blocks create gameplay light and can feed mirror/prism routing.
- Mirror cells are blocked for navigation/collision.
- `allowedBlockIds` prevents L5 red/blue socket swapping.
- A level clears only when the player reaches the exact exit cell, all authored
  gates are open, the player is not holding a block, and the player is grounded.
- Start and exit cells are always solid; validation checks the route and gates,
  not just adjacency to the exit.

## 5. Current Level Contracts

| Level | Name | Intended solve in code | Current QA interpretation |
|---:|---|---|---|
| 1 | 첫 빛: 방향 맞추기 | Pick locked white `b1`, place on `s1`, aim east. | Step tutorial teaches move, look, pick, place, wheel rotate, and exit. |
| 2 | 모퉁이 돌리기 | Place locked white `b1` east, rotate `m1` to `0`. | Demonstrates mirror bounce; direct-only state is expected to fail. |
| 3 | 두 거울로 잇기 | Place locked white `b1` east, rotate `m1` to `90`, `m2` to `315`. | Demonstrates pass comparison and chained mirrors. |
| 4 | 흰빛에서 노랑으로 | Place white prism `p1` on `s1`, aim east, open yellow gate via red+green split. | Demonstrates prism split and additive red+green yellow gate. |
| 5 | 잔광, 마젠타 | Place locked red `b1` on `s1`, locked blue `b2` on `s2`, rotate `m1` to `225`; small aim-tolerance set is accepted. | Demonstrates red+blue magenta gate; still worth manual puzzle-feel QA. |

The level data is intentionally anti-cheese validated, but anti-cheese does not
equal good puzzle feel. L4/L5 need design and instruction review.

## 6. Latest Automated Verification Snapshot

Last known local checks from this branch:

| Command | Result |
|---|---|
| `npm ci` | Passed |
| `npm run validate:levels` | Passed |
| `npm run smoke:interactions` | Passed |
| `npm run capture:report` | Passed and refreshed 15 report captures |
| `npm run build` | Passed; Vite reported chunk-size warning only |
| `git diff --check` | Passed in the independent verification pass and again after doc consolidation |

Independent subagent verification also reported `PASS` / `APPROVE` with no P0,
P1, or blocking P2 findings. It verified `npm ci`, level validation, smoke
interactions, build, capture generation, nonblank PNG checks, carried-light
honesty, visual convergence, and diff whitespace hygiene.

This signoff is code/build oriented. It does not replace manual in-browser QA
for puzzle clarity and visual polish.

`npm run validate:levels` currently reports exhaustive winning configurations
inside the intended class only:

| Level | Path length | Exhaustive wins | Bypass count |
|---:|---:|---:|---:|
| Open scarcity probe | 16 / 196 walkable cells | n/a | n/a |
| L1 | 6 / 14 | 1 | 0 |
| L2 | 8 / 30 | 1 | 0 |
| L3 | 10 / 38 | 1 | 0 |
| L4 | 9 / 24 | 1 | 0 |
| L5 | 10 / 43 | 3 | 0 |

Important caveat: the smoke test can pass while manual UX still feels uneven.
The current focus below should be treated as regression/polish QA, not as known
code-level blockers.

## 7. Regression / Polish QA Findings

| ID | Severity | Finding | Likely area |
|---|---|---|---|
| QA-001 | Regression | On every stage entry, first click should acquire mouse-look, show Korean guidance, and not also place/pick on that click. Esc/unlock should restore the cursor and overlay. | `src/main.js`, `src/core/cameraRig.js`, `src/core/input.js`, overlay/pointer-lock flow |
| QA-002 | Visual polish | Colored blocks should read as their hue and not blow out to flat white in normal play or report captures. | `src/entities/EmissiveBlock.js`, `src/world/materials.js`, bloom/emissive tuning |
| QA-003 | UX regression | Wheel/`[`/`]` should be the only object rotation path. Mouse movement should affect camera look only. | `src/main.js`, input hints, ghost indicator |
| QA-004 | UX polish | Objectives, fall/reset/undo rules, and help card should remain clear in Korean on every level. | HUD objective text, title/level overlays |
| QA-005 | Design polish | L4 should clearly read as prism split -> red+green -> yellow gate. | `src/game/levels.js`, `docs/LEVELS.md`, level geometry/objective |
| QA-006 | Design polish | L5 should clearly read as red+blue -> magenta finale, not just place-and-rotate. | `src/game/levels.js`, `docs/MECHANICS_v3.md`, level geometry/objective |
| QA-007 | Report evidence | Capture comparison shots 04/05 and 07/08/09 must stay same camera/state and differ only in mode. | `scripts/capture-report.mjs`, QA hooks in `src/main.js` |

## 8. QA Focus Checklist

- Fresh-load each level and verify mouse-look, click, E, and wheel work immediately.
- Verify level transitions unlock/show the cursor when overlays or completion UI
  appear, then recover correctly when entering the next level.
- Test whether E works without first clicking, with pointer lock, and after pointer
  lock failure/fallback drag-look.
- Verify wheel rotates the intended selected object and that HUD/crosshair clearly
  explains what will rotate.
- In L1-L5, try to clear by holding blocks, wrong sockets, wrong colors, wrong
  mirror angles, and exit-adjacent cells.
- In L4, check whether the prism/color split is visible and whether the objective
  text explains yellow = red + green.
- In L5, check whether red direct + blue relay + magenta gate is understandable
  without reading source/docs.
- Check reset/fall/undo behavior from awkward states.
- Check bright emissive objects in both normal play and report-capture views.
- Do not spend time on mobile/touch UI; it is out of scope.

## 9. Current Documentation Map

| Document | Use |
|---|---|
| `docs/SPEC.md` | Latest integrated implementation spec |
| `README.md` | Project entry, commands, short controls, deployment notes |
| `REPORT.md` | Course/report-facing summary, theory mapping, capture list |
| `docs/CONVENTIONS.md` | Frozen naming/data-model decisions |
| `docs/MECHANICS_v3.md` | Active routing design lock, anti-cheese contract |
| `docs/LEVELS.md` | Level schema and intended solve summary |
| `docs/PRD.md` | Product requirements and success criteria |
| `docs/IMPLEMENTATION_GUIDE.md` | File-by-file implementation guide |
| `docs/QA_HANDOFF.md` | This consolidated current-state QA handoff |

## 10. Bottom Line

The codebase is in a buildable, testable state for QA and report capture. The
remaining risk is qualitative: puzzle clarity, visual polish, and in-browser
regression checks around pointer lock, rotation, and level transitions.
