# AGENT PROMPT — AFTERGLOW 구현 인계

> Codex / Claude Code에 아래 블록을 그대로 붙여넣는다. (이 폴더 `AFTERGLOW/docs/`의 PRD.md·IMPLEMENTATION_GUIDE.md가 단일 진실원)

```text
You are implementing a Three.js + Vite web game called AFTERGLOW.
Authoritative spec: read docs/CONVENTIONS.md (frozen names/data model — read FIRST), docs/PRD.md, docs/IMPLEMENTATION_GUIDE.md, and docs/LEVELS.md in this folder and follow them exactly. On any naming/model conflict, docs/CONVENTIONS.md wins.

OBSOLETE FILES (read first)
This repo's only reusable base is ../TheAviator (Vite setup + camera/quaternion/matrix helpers). Treat any
other pre-existing game files as obsolete. If files from an unrelated "GlowGarden Scanner" (first-person
scanner / glow plants / central gate scan / cave escape) exist, do NOT adapt them — delete or replace them
under the AFTERGLOW architecture. These docs (PRD/GUIDE/LEVELS) are the ONLY source of truth.

CONCEPT
3D grid-based light puzzle platformer. The player places emissive blocks. A CPU SurfelGI-style
radiosity solver computes direct + indirect (2-bounce) light on floor/wall surfels. Only floor
tiles whose irradiance luminance exceeds a threshold are walkable. The player builds a path of
light to reach the exit. GI is the rule system, not decoration.
This is NOT physically accurate DDGI or full real-time SurfelGI. Call it
"CPU SurfelGI-style radiosity approximation" in README/REPORT.

BASE
Reuse ONLY the Vite setup and the camera/quaternion/matrix helper concepts from ../TheAviator.
Do NOT keep the airplane gameplay. Build a fresh project under AFTERGLOW/ per the file tree in
IMPLEMENTATION_GUIDE.md §1.

DO NOT IMPLEMENT
- GPU readback for gameplay logic (walkable MUST be CPU-deterministic, single source of truth = gi/SurfelSolver.js)
- DDGI probe grid
- mobile/touch UI (desktop keyboard + mouse only)
- any "scanner/glow-plant/cave-escape" gameplay (those belong to an unrelated spec; ignore)

ARCHITECTURE (two layers — see PRD §3)
- Logic layer (CPU deterministic): gi/SurfelSolver.js, game/rules.js → walkable, win/lose, color gate
- Visual layer: gi/applyGI.js, gi/debugView.js → material color/emissive, ≤4 shadowless point lights, debug
- Both read the SAME surfel irradiance value.

MUST-HAVE SYSTEMS (PRD §5, GUIDE §3/§4/§7)
- continuous WASD movement with CPU GI ground-contact sampling, dwell/coyote support, and instant respawn
- instant respawn, R reset, Z unlimited undo (game/commandStack.js)
- blocks are never consumed, always recoverable, placed ONLY on level-defined sockets
- tile state telegraphed before flipping solid/void; solid/void shown by brightness+edge+pattern, NOT color alone
- color palette + shape icons exactly as PRD §6 (Okabe–Ito based)
- carried block = direct-only, short CARRY_RADIUS, NO bounce; placed block (socket only) = full + bounce + persistent; start/exit pads are always solid (GUIDE §3.5)
- color gate rule: white CANNOT open color gates. gate walkable = luminance≥GATE_ON AND chroma≥MIN_CHROMA AND hueDot(target)≥0.88 (GUIDE §3.4)
- target selection is desktop FP: mouse-look + center raycast, with small pick/socket assist so E is forgiving (GUIDE §7)
- separate logic (walkable boolean, instant/coyote) from visual TileState transitions (0.3–0.4s telegraph); never instant-vanish (GUIDE §3.6)
- "GI-off fallback" = the app stays runnable and direct-light baseline stays visible; it does NOT mean every level is solvable with GI off. Level 2 intentionally REQUIRES GI/bounce to solve.

CRITICAL DATA RULES (avoid solver/level contradictions)
- Initial block spawn rule: a block may start on a NON-socket pickup cell, but that is NOT a placed state.
  Use state:'pickup' (placed=false) for spawn blocks; spawnCell must be adjacent to start (or alwaysSolid) so it is pickable at load. Pickup blocks give no/short carried light; ONLY blocks placed on level-defined sockets give full intensity + bounce. Never start a block as 'placed' on a non-socket cell.
- Light sample height: emissive blocks emit from cell center at y=BLOCK_LIGHT_HEIGHT (0.85), NOT the floor plane;
  floor surfels at y=FLOOR_SURFEL_HEIGHT (0.04). Without this, floor surfels (normal (0,1,0)) get cosθ=0 → zero direct light from same-height blocks.
- Exit assert rule: start and exit pads are alwaysSolid. Direct-only FAILURE asserts must target the ENTRY/path tile before the exit, NOT the exit cell itself (see docs/LEVELS.md L2 = cell (2,4), not exit (1,4)).
- validateLevel headless: implement scripts/validate-levels.mjs (no DOM/Three) and wire "build": "npm run validate:levels && vite build". Keep SurfelSolver/levels/rules browser-independent so Node can import them.

SOLVER (GUIDE §3, constants §4)
Implement gi/SurfelSolver.js (solve only on block place/move/colorchange/levelload/modechange):
clear → computeDirect → bounce pass1 (src=direct) → bounce pass2 (src=direct+bounce1) →
combine by mode (DIRECT_ONLY|BOUNCE1|BOUNCE2|GI) → walkable with hysteresis (WALK_ON 0.60 / WALK_OFF 0.40).
Visibility via 2D XZ segment intersection (gi/visibility.js); form factor cosS*cosN/(π·d2) (gi/formFactor.js).
Use the constants table in GUIDE §4 as starting values.

LEVELS (docs/LEVELS.md — exact maps/coords/sockets/panels/gates/expectedSolution/asserts)
Implement the 5 levels EXACTLY from docs/LEVELS.md (do not invent geometry). Each level ships with
validateAsserts; implement validateLevel() (GUIDE §3.7) and ensure ALL 5 levels pass on load/build.
If a reference map can't satisfy its asserts, adjust geometry by 1–2 cells to satisfy the asserts
(asserts are the contract, ASCII is reference). Every level completable without debug teleport.

UI (GUIDE §8)
Single SPA: index.html + canvas + DOM overlays. States: TITLE/GAME/LEVEL_COMPLETE/GAME_COMPLETE/PAUSE.
HUD per GUIDE §8. Debug keys + capture support per GUIDE §11 (C prints screenshot name).

ASSETS (GUIDE §10) — scripts/fetch-assets.mjs, graceful fallback (MUST exit 0 on download failure), runtime loads only from public/
ambientCG (CC0, url https://ambientcg.com/get?file=<ID>_1K-JPG.zip):
  floor_tile = PavingStones033, wall_rock = Rock013, bounce_panel = Concrete042A, gate_stone = reuse floor.
Character RobotExpressive.glb (CC0, Tomás Laulhé):
  https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb
  (fallback: procedural capsule robot). If any download fails, fall back to procedural CanvasTexture / capsule.
Texture: basecolor/emissive = SRGBColorSpace; normal/roughness/ao = NoColorSpace; RepeatWrapping; uv2=uv where AO used.
IMPORTANT: solver uses geometric surfel normals; normalMap is visual-only (do NOT feed normalMap into solver).

DELIVERABLES
- Full src/ per GUIDE §1 file tree, building from milestones GUIDE §12.
- REPORT.md (concept, controls, system, L4/L5/L6/L8 mapping, color system, limitations/fallback, 15 screenshots GUIDE §11).
- README.md with run instructions and asset credits/licenses.

ACCEPTANCE (GUIDE §13) — verify before finishing
npm install
npm run fetch-assets    # MUST exit 0 even when downloads fail (print fallback notice, use procedural)
npm run validate:levels # all 5 levels' asserts pass (headless)
npm run build           # = validate:levels && vite build; must pass
- validate:levels passes for all 5 levels (headless assertions per docs/LEVELS.md).
- Title→L1 works; all 5 levels completable; L2 direct-only fails but GI succeeds (visibly).
- walkable matches solver; cannot stand on void tiles; coyote/buffer feel fair; undo/reset work; no softlock.
- RobotExpressive loads or procedural fallback; texture fallback works.
- Deploy link opens in a fresh/incognito browser.

FINAL REMINDER
GI is not decoration; GI is the rule system. Light itself creates the walkable floor.
Keep gameplay logic CPU-deterministic and the game always runnable.
```

## 사용 메모
- 구현 시작 전 에이전트에게 `../TheAviator/`(베이스)와 이 `AFTERGLOW/docs/` 접근을 보장할 것.
- git/배포는 사용자(소유자)가 진행. 에이전트는 `vite.config.js`의 `base`와 `import.meta.env.BASE_URL` 사용까지만 책임.
- 막히면 GUIDE §3 성능 폴백(surfel/패스/반경 축소) 및 §10 에셋 폴백을 따른다.
