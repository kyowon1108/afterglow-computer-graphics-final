# IMPLEMENTATION GUIDE — AFTERGLOW

구현 에이전트(Codex/Claude Code)를 위한 **파일 단위 빌드 명세**. PRD.md를 먼저 읽고 시작할 것.

---

## 0. 셋업
1. `../TheAviator/`에서 **Vite 세팅(`package.json`, `vite.config.js`), 카메라/쿼터니언/행렬 헬퍼**만 참고. 비행기 게임 로직은 가져오지 않는다.
2. 새 프로젝트 루트 = `AFTERGLOW/`. 의존성: `three@^0.184.0`, `gsap@^3.12`, `vite`.
3. `npm run` 스크립트: `dev`, `build`, `preview`, `fetch-assets`(= `node scripts/fetch-assets.mjs`).
4. `vite.config.js`에 배포용 `base` 설정. **모든 런타임 에셋은 `import.meta.env.BASE_URL` 기준**으로 로드.

---

## 1. 정확한 폴더/파일 트리
```
AFTERGLOW/
├─ index.html                 # SPA 진입 + DOM 오버레이 마크업(타이틀/HUD/오버레이)
├─ package.json
├─ vite.config.js             # base 경로
├─ scripts/
│   ├─ fetch-assets.mjs       # 텍스처/모델 다운로드·정규화·graceful fallback (실패해도 exit 0)
│   └─ validate-levels.mjs    # headless 레벨 검증(no DOM/Three), build 앞단에서 실행
├─ public/
│   ├─ models/
│   │   └─ RobotExpressive.glb
│   └─ assets/textures/
│       ├─ floor_tile/        # basecolor/normal/roughness/ao .jpg
│       ├─ wall_rock/
│       ├─ bounce_panel/
│       └─ gate_stone/
└─ src/
    ├─ main.js                # 부트스트랩, 메인 loop(), 상태머신
    ├─ core/
    │   ├─ appState.js        # TITLE/GAME/LEVEL_COMPLETE/GAME_COMPLETE/PAUSE
    │   ├─ renderer.js        # WebGLRenderer, resize, (옵션) bloom
    │   ├─ cameraRig.js       # FP mouse-look + peek/third 보조 카메라
    │   ├─ input.js           # 키맵 + 액션버퍼 + 연속 이동 축
    │   ├─ assets.js          # 텍스처/glTF 로더 + 폴백 + 캐시
    │   ├─ constants.js       # 모든 튜닝 상수(§4)
    │   └─ math.js            # clamp, luminance, lerpColor, segmentIntersect 등
    ├─ world/
    │   ├─ levelBuilder.js    # levelDef → room/grid/walls/blocks/exit 인스턴스화
    │   ├─ room.js            # 방 프레임(천장/외벽 시각)
    │   ├─ floorGrid.js       # 타일=surfel 격자 생성, cell↔world, tileAt()
    │   ├─ walls.js           # WallSegment(가림+bounce 면), bounce panel
    │   ├─ tileMesh.js        # 타일 메쉬/인스턴싱 + 상태별 외형 갱신
    │   └─ materials.js       # 머티리얼 팩토리(§6)
    ├─ gi/
    │   ├─ SurfelSolver.js    # ★CPU radiosity(§3) — walkable의 단일 진실원
    │   ├─ visibility.js      # XZ 평면 segment 교차(occlusion/shadow ray)
    │   ├─ formFactor.js      # cosS*cosN/(π·dist²) 가중치
    │   ├─ sampleField.js     # continuous foot sampling + Schmitt/dwell/coyote helpers
    │   ├─ applyGI.js         # irradiance → 타일 머티리얼/emissive/point light
    │   └─ debugView.js       # surfel 점·walkable·패스 시각화(F1/V/B/N)
    ├─ entities/
    │   ├─ Player.js          # 연속 WASD 이동 + ground contact + 낙사
    │   ├─ EmissiveBlock.js   # 배치형 발광 광원(Le), 색/강도/고스트
    │   └─ ExitPortal.js      # 출구, 도달 판정
    ├─ game/
    │   ├─ levels.js          # LEVELS[0..4] 정의(셀 데이터)
    │   ├─ rules.js           # walkable 연동, 낙사/리스폰/승리
    │   ├─ commandStack.js    # 블록 액션 undo 스택
    │   ├─ hud.js             # 상단/하단 HUD 갱신
    │   └─ overlays.js        # 타이틀/레벨완료/게임완료/일시정지 DOM
    └─ report/
        └─ capture.js        # 스샷명 출력(C), GI/bounce 토글 보조
```

---

## 2. 좌표계 / 데이터 모델

**좌표:** Y up, 그리드 XZ, 바닥 y=0. `TILE_SIZE=1.25`, 벽 높이 2.4, 두께 0.18.
```
worldX = (cell.x - width/2)  * TILE_SIZE
worldZ = (cell.z - height/2) * TILE_SIZE
1 floor tile = 1 floor surfel = walkable 단위 / wall segment = wall surfel(bounce 전용)
```

```js
// gi/SurfelSolver.js 내 타입(주석용)
TileSurfel = {
  id, cell:{x,z}, pos:Vector3, normal:Vector3,
  type:'floor'|'wall'|'gate', albedo:Color,
  direct:Color, bounce1:Color, bounce2:Color,
  irradiance:Color, visualIrradiance:Color,
  walkable:boolean, wasWalkable:boolean,
  gateColor:null|'red'|'green'|'blue', icon:null|'triangle'|'square'|'circle', uvRect
}
EmissiveBlock = { id, spawnCell:{x,z}, cell:{x,z}|null, colorKey:'white'|'red'|'green'|'blue',
  color:Color, intensity:number, state:'pickup'|'carried'|'placed', on:boolean }
// 초기: state='pickup', cell=null, spawnCell에 존재(소켓 아님). 픽업 시 'carried', 소켓 배치 시 'placed'(cell=socket.cell).
// lightPos는 state로 분기(중요): pickup→빛 없음(emit 안 함) / carried→playerCell / placed→socket cell
//   placed:  lightPos = cellToWorld(cell)       + (0,BLOCK_LIGHT_HEIGHT,0)   // full + bounce
//   carried: lightPos = cellToWorld(playerCell) + (0,BLOCK_LIGHT_HEIGHT,0)   // direct-only, CARRY_RADIUS, no bounce
//   pickup:  방출 안 함 (spawnCell을 lightPos로 쓰지 말 것)
// floorSurfel.pos = cellToWorld(cell) + (0, FLOOR_SURFEL_HEIGHT, 0)
WallSegment = { a:Vector2, b:Vector2, normal:Vector3, blocksVisibility:true }
```

---

## 3. 핵심 알고리즘 — `gi/SurfelSolver.js`
**walkable의 단일 진실원.** 블록 배치/이동/색변경/레벨로드/모드변경 시에만 실행(이벤트 구동, 매 프레임 X).

```js
solve(level, mode='GI'):
  for s in surfels: s.direct = s.bounce1 = s.bounce2 = Color(0)
  computeDirect(level)            # (3.1)
  computeBounce(level, pass=1)    # (3.2) source=direct
  computeBounce(level, pass=2)    # (3.2) source=direct+bounce1
  for s in surfels:
    s.irradiance = combineByMode(s, mode)   # (3.3)
    s.visualIrradiance.lerp(s.irradiance, VISUAL_LERP)   # 시각용 부드러운 전이
    updateWalkable(s)             # (3.4)
```

### 3.1 Direct (L4 직접항)
```js
for s in surfels:
  for b in level.blocks where b.on and b.state in {'placed','carried'}:
    Lp = b.lightPos                              # 셀 중심 + BLOCK_LIGHT_HEIGHT (높이 필수)
    if b.state=='carried' and distance(Lp,s.pos) > CARRY_RADIUS: continue   # carried는 짧은 반경
    if visible(Lp, s.pos, level.walls):          # visibility.js, shadow ray (XZ)
      L = normalize(Lp - s.pos)
      cosT = max(0, dot(s.normal, L))            # floor normal=(0,1,0) → 높이차가 있어야 cosT>0
      d2 = max(distanceSq(Lp, s.pos), 0.25)      # 특이점 클램프
      I  = (b.state=='carried') ? b.intensity*CARRY_INTENSITY_SCALE : b.intensity
      s.direct.add( b.color * I * cosT / d2 )
```
> bounce 패스(3.2)는 **placed 블록이 만든 direct만** source로 사용. carried 블록은 bounce 미참여(`s.direct` 중 carried 기여는 bounce source에서 제외하거나, carried는 별도 버퍼에 누적).

### 3.2 Bounce (L8 indirect, 이웃 surfel 재사용 · 2패스=다중 바운스)
```js
computeBounce(level, pass):
  target = (pass==1) ? 'bounce1' : 'bounce2'
  for s in surfels:
    for n in neighborsWithin(s, BOUNCE_RADIUS):  # 공간 그리드로 후보 축소
      if n===s or !visible(s.pos, n.pos, level.walls): continue
      src = (pass==1) ? n.direct : add(n.direct, n.bounce1)
      f = formFactor(s, n)                        # cosS*cosN/(π·d2)
      s[target].add( n.albedo * src * f * PATCH_AREA * BOUNCE_SCALE )
    clamp total indirect luminance to INDIRECT_CLAMP
```
`formFactor(s,n)`: `dir=normalize(n.pos-s.pos); cosS=max(0,dot(s.normal,dir)); cosN=max(0,dot(n.normal,-dir)); d2=max(distanceSq,0.25); return cosS*cosN/(π*d2)`.

### 3.3 모드 결합 (리포트 캡처)
```
DIRECT_ONLY → direct
BOUNCE1     → direct + bounce1
BOUNCE2/GI  → direct + bounce1 + bounce2
VISUAL_OFF  → 0 (디버그)
```

### 3.4 walkable (히스테리시스 + 게이트)
```js
L = luminance(s.irradiance)
s.wasWalkable = s.walkable
s.walkable = s.walkable ? (L >= WALK_OFF) : (L >= WALK_ON)   // 일반 타일(white 만능)
if s.gateColor:                                              // 색 게이트(white 차단)
  s.walkable = hueMatchesGate(s.irradiance, paletteColor(s.gateColor))
```
**함수명 고정:** 게이트 판정은 `hueMatchesGate(E, target)`, 내부에서 `hueDot` 헬퍼 사용:
```
hueMatchesGate(E,t) = luminance(E) >= GATE_ON
                   && chroma(E)     >= MIN_CHROMA           // white≈0 → 차단
                   && hueDot(E,t)   >= HUE_DOT
chroma(E) = (max(r,g,b)-min(r,g,b)) / max(max(r,g,b),1e-4)
hueDot(E,t) = dot(normalize(E.rgb), normalize(t.rgb))       // (또는 hue각 ±20°)
```

### 3.5 Block state: pickup / carried / placed (닭-달걀/트리비얼화/소켓충돌 방지)
- **pickup(초기):** 블록은 `spawnCell`(**소켓 아님**)에 `state:'pickup'`로 존재. **빛 없음**(또는 무시 가능). `spawnCell`은 start 패드에 인접(또는 alwaysSolid) → 시작 시 항상 집을 수 있음. ※ "초기 블록을 소켓에 placed로 두지 말 것"(소켓에만 배치 규칙과 충돌).
- **carried(들고 있음):** 빛은 **플레이어 셀에서 직접광만**, 반경 `CARRY_RADIUS`(짧음), 강도×`CARRY_INTENSITY_SCALE`, **bounce 패스 미참여**. → 이동용 최소 조명. 코너 너머·원거리·bounce 필요 타일은 못 켠다.
- **placed(소켓에 배치):** 전체 강도 + **bounce 참여** + 영속. → 멀리/코너로 빛을 보내는 유일한 수단.
- **start·exit 패드는 항상 solid**(빛 무관). solver는 이 패드를 `alwaysSolid=true`로 두고 walkable 강제 true.
> 효과: 플레이어는 절대 빛 없이 갇히지 않으면서(공정), 퍼즐은 "배치/bounce"로만 풀린다(트리비얼화 방지).

### 3.6 walkable(logic) → TileState(visual) 분리
`walkable` boolean은 **로직 즉시값**, 화면 전이는 **별도 타이머**로(공정성). `tileMesh.js`가 관리:
```
TileState = 'void' | 'prelit' | 'solid' | 'fading' | 'gateLocked' | 'gateOpen'
tile.transitionTimer, tile.coyoteTimer
```
| 상황 | 로직 | 시각 |
|---|---|---|
| L ≥ WALK_ON | walkable=true 즉시 가능 | `prelit`→`solid`, 0.3s 밝아짐 |
| L < WALK_OFF | walkable은 coyote 동안 유지 | `fading`, red/gray flicker |
| coyote 만료 | walkable=false | `void` fade-out |
| fading 위 플레이어 | coyote 타이머 표시 | edge pulse |
| 게이트 hue 부족 | walkable=false | `gateLocked`, 아이콘 어둡게 |
| 게이트 충족 | walkable=true | `gateOpen`, 아이콘 발광+엣지 |
> **시각 telegraph 타이밍 ≠ 충돌 전환 타이밍.** 충돌은 즉시/coyote, 시각은 0.3~0.4s. 절대 즉시 사라짐 금지.

### 3.7 validateLevel (레벨 자기검증 — 필수)
레벨 로드/빌드시 콘솔 self-check. 단언 실패 = 레벨 데이터 오류. 상세·레벨별 단언은 **`docs/LEVELS.md` 참조**.
```
validateLevel(level):
  assert tileAt(start).alwaysSolid && tileAt(exit).alwaysSolid
  applyExpectedSolution(level); solve(level,'GI'); assert pathExists(start→exit)
  for a in level.validateAsserts:           // a.afterPlace를 placed로 시뮬레이션 후 solve
    resetBlocksToPickup(level); for [bid,sid] in a.afterPlace: placeBlockOnSocket(bid,sid)
    solve(level,a.mode); assert walkable(a.cell)===a.expected
  for b in level.blocks: assert isAdjacent(b.spawnCell,start) || tileAt(b.spawnCell).alwaysSolid
  assert noStrandingDuringSolution(level)   // 단계 사이 항상 walkable 경로
```
**headless 강제(중요):** `scripts/validate-levels.mjs`로 구현하고 `package.json`에서 `"build": "npm run validate:levels && vite build"`로 묶는다. → 브라우저 콘솔만이 아니라 **빌드가 레벨 검증을 강제**. 이를 위해 `SurfelSolver.js`/`levels.js`/`rules.js`는 **Three/DOM 비의존 순수 모듈**(THREE 객체 직접 생성 금지, Vector/Color는 경량 자체 구현 또는 three 순수 import)로 작성해 Node에서 import 가능해야 함. 상세 단언은 `docs/LEVELS.md`.

### 성능
공간 해시 그리드로 이웃 후보 축소. surfel 300~450, 블록 1~4, 2패스 → 1회 solve 수 ms. 부족 시 surfel/패스/반경 축소.

---

## 4. 상수 — `core/constants.js`
```js
export const TILE_SIZE = 1.25;
export const WALL_HEIGHT = 2.4, WALL_THICKNESS = 0.18;
export const WALK_ON = 0.60, WALK_OFF = 0.40;          // 히스테리시스
export const BOUNCE_RADIUS = 4.25 * TILE_SIZE;
export const BOUNCE_SCALE = 9.8, INDIRECT_CLAMP = 0.72, BOUNCE_PASSES = 2;
export const DIRECT_INTENSITY_WHITE = 17, DIRECT_INTENSITY_COLOR = 19;
export const VISUAL_LERP = 0.18;
export const MOVE_LERP_MS = 80, COYOTE_MS = 85, INPUT_BUFFER_MS = 100;
export const RESPAWN_FADE_MS = 350, TILE_TELEGRAPH_MS = 400;
export const MAX_SURFELS = 450, MAX_BLOCKS = 4;
export const GATE_ON = 0.60, HUE_DOT = 0.88, MIN_CHROMA = 0.35;
export const CARRY_RADIUS = 1.6 * TILE_SIZE;     // carried 블록 직접광 반경(짧음)
export const CARRY_INTENSITY_SCALE = 0.8;        // carried = placed의 80%, bounce 미참여
// 발광/샘플 높이 — 필수(없으면 floor normal(0,1,0)과 동일높이 블록 방향이 수평→cosθ=0→직접광 0)
export const BLOCK_LIGHT_HEIGHT = 0.85;          // 블록은 셀 중심 y=0.85에서 발광
export const FLOOR_SURFEL_HEIGHT = 0.04;         // floor surfel 샘플 높이
export const WALL_SURFEL_HEIGHT = 1.0;           // wall surfel 샘플 높이
export const PALETTE = {
  white:{hex:0xFFFFFF, icon:'diamond'},  red:{hex:0xD55E00, icon:'triangle'},
  green:{hex:0x009E73, icon:'square'},   blue:{hex:0x0072B2, icon:'circle'},
  orange:{hex:0xE69F00, icon:'diamondFilled'},
};
```
> 위 값은 튜닝 시작점. 플레이테스트로 조정.

---

## 5. 파일별 책임 + 핵심 export
| 파일 | 책임 | 핵심 export |
|---|---|---|
| `main.js` | 부트스트랩, `loop(dt)`, 상태 전환 | `init()` |
| `core/appState.js` | 앱 상태 enum + 전환 | `AppState`, `setState()`, `getState()` |
| `core/renderer.js` | WebGLRenderer, resize, (옵션)bloom | `initRenderer()`, `render(scene,cam)` |
| `core/cameraRig.js` | 1인칭 기본 카메라, mouse-look, peek/third 보조 시점 | `update(level, player)`, `setMode('fp'|'peek'|'third')` |
| `core/input.js` | 키 상태 + 액션 버퍼 + 연속 이동 축 | `consumeAction(k)`, `movementAxes()`, `isDown(k)` |
| `core/assets.js` | 텍스처/glTF 로드 + 폴백 + 캐시 | `loadTexSet(name)`, `loadRobot()` |
| `core/constants.js` | 상수 | (named exports) |
| `core/math.js` | 유틸 | `clamp`, `luminance`, `segmentIntersect`, `cellToWorld` |
| `world/levelBuilder.js` | levelDef → 씬 객체 | `build(levelDef, scene)` → `{grid,walls,blocks,exit,start}` |
| `world/room.js` | 방 프레임 | `buildRoom(levelDef)` |
| `world/floorGrid.js` | 타일/surfel 격자 | `buildGrid(levelDef)`, `tileAt(cell)`, `surfels[]` |
| `world/walls.js` | WallSegment + bounce panel | `buildWalls(levelDef)`, `wallSurfels[]` |
| `world/tileMesh.js` | 타일 외형(상태별) | `setTileVisual(tile, state)` |
| `world/materials.js` | 머티리얼 팩토리 | `makeLitTileMat()`, `makeVoidTileMat()`, `makeWallMat()`, `makeBounceMat()`, `makeBlockMat(color)`, `makeGateMat()`, `makeExitMat()` |
| `gi/SurfelSolver.js` | CPU radiosity, walkable | `solve(level,mode)`, `getIrradiance(id)`, `setMode(m)` |
| `gi/visibility.js` | XZ 교차 가림 | `visible(aPos,bPos,walls)` |
| `gi/formFactor.js` | 폼팩터 | `formFactor(s,n)` |
| `gi/applyGI.js` | 값→시각 | `apply(surfels, materials, lights)` |
| `gi/debugView.js` | 디버그 시각화 | `toggle()`, `setBouncePass(p)`, `draw()` |
| `entities/Player.js` | 캐릭터·연속 WASD 이동·ground contact·낙사 | `update(dt, level, input, cameraRig)`, `respawn()` |
| `entities/EmissiveBlock.js` | 발광 블록·고스트 | `pick()`, `place(cell)`, `cycleColor()`, `ghostPreview(cell)` |
| `entities/ExitPortal.js` | 출구 | `update(dt)`, `reached(playerCell)` |
| `game/levels.js` | 5레벨 데이터 | `LEVELS` |
| `game/rules.js` | 판정·승패·리스폰 | `check(player,grid)`, `onBlockChange()`, `reset()` |
| `game/commandStack.js` | undo | `push(cmd)`, `undo()`, `clear()` |
| `game/hud.js` | HUD DOM | `update(state)` |
| `game/overlays.js` | 화면 오버레이 | `showTitle()`, `showLevelComplete(stats)`, `showGameComplete()` |
| `report/capture.js` | 캡처 보조 | `printShotName(state)` |

---

## 6. 머티리얼 — `world/materials.js`
`MeshStandardMaterial` 기준. **노멀맵은 시각 전용**(solver는 geometric normal 사용).
| 머티리얼 | 대상 | 설정 |
|---|---|---|
| LitTileMaterial | walkable 바닥 | PavingStones033 + `emissive`=visualIrradiance, 엣지 하이라이트 |
| VoidTileMaterial | unlit 타일 | 어두운 반투명, emissive 낮음, 엣지 없음 |
| WallRockMaterial | 외벽 | Rock013 |
| BouncePanelMaterial | 바운스 벽 | Concrete042A, high albedo `#F2F0E6` |
| EmissiveBlockMaterial | 블록 | 색별 emissive + CanvasTexture 아이콘 decal |
| GateTileMaterial | 색 게이트 | 아이콘+패턴, locked=어두움 / open=발광+solid |
| ExitPortalMaterial | 출구 | warm emissive `#FFE6A3` |
| DebugSurfelMaterial | surfel 점 | instanced sphere/point |

```js
// irradiance → material (applyGI.js)
tile.mat.emissive.copy(tile.visualIrradiance);
tile.mat.emissiveIntensity = clamp(luminance(tile.visualIrradiance), 0, 1.6);
tile.mat.color = lerpColor(VOID_COLOR, baseColor, solidAlpha);
tile.edge.visible = tile.walkable || tile.telegraphing;
```
시각 보조 광: **최근접 ≤4개 블록만 shadowless PointLight** + 약한 directional 1 + 낮은 ambient. (forward 렌더러 라이트 한계 대응.)

---

## 7. 입력 / 상호작용 — `core/input.js`, `cameraRig.js`, `entities/EmissiveBlock.js`
| 키 | 동작 |
|---|---|
| Mouse | 1인칭 mouse-look. 중앙 crosshair로 블록/소켓 조준 |
| WASD/Arrow | 연속 이동. ground contact는 CPU GI field를 샘플링 |
| E / LMB | 블록 pick / place(소켓에만). **free drop 없음** — 유효 소켓이 아니면 빨강 고스트+shake만 |
| Q | 든 블록 색 순환 white→red→green→blue→white |
| Z / R | undo / 레벨 리셋 |
| G | GI ↔ DIRECT_ONLY 토글 |
| B | bounce 디스플레이 FINAL→DIRECT→BOUNCE1→BOUNCE2 |
| M / T | peek(top-down 확인용) / third 카메라 |
| F1 / V / N | 디버그 PIP / surfel 점 / normal·albedo·irradiance |
| C / Esc | 스샷명 출력 / pause·title |

**배치 규칙(중요):** 블록은 **레벨 정의 socket(floor pad/wall socket)에만**. invalid=빨강 고스트+shake, valid=색 고스트. 배치/이동/색변경 → `rules.onBlockChange()` → `SurfelSolver.solve()`. 블록은 소모되지 않음.

**타겟 선택 UX(고정 · desktop only):**
| 항목 | 규칙 |
|---|---|
| 기본 대상 | 카메라 중앙 raycast가 맞춘 블록/소켓 |
| pick 보조 | raycast가 빗나가도 플레이어 근처 블록은 E로 pick 가능 |
| place 보조 | raycast가 빗나가도 플레이어 근처 빈 socket 또는 전방 socket은 E로 place 가능 |
| E (손 비었고 대상이 블록) | pick |
| E (블록 들었고 대상이 빈 socket) | place |
| E (블록 들었고 대상이 socket 아님) | place 불가(빨강 고스트+shake), drop 없음 |
| 고스트 프리뷰 | 유효 socket 위에 표시(valid=색, invalid=빨강) |
| 하이라이트 | 현재 대상 + 든 블록 색 HUD |
> 모바일 UI/터치 조작은 범위 밖. 조작은 desktop keyboard + mouse 기준.

---

## 8. 화면 / HUD — `game/overlays.js`, `game/hud.js`
SPA: `index.html` + canvas + DOM 오버레이 토글.
- **Title:** 제목·부제·Start·How to Play·Credits.
- **Game HUD:** 상단중앙 `AFTERGLOW · Level n/5`, 좌상단 목표 텍스트, 우상단 `Camera/GI/Bounce View/Held(아이콘+색)/Foot(밝기·solid|void)`, 하단좌 조작, 우하단 F1 디버그(surfel수·walkable수·solve time).
- **Level Complete:** `Level n cleared` + stats(solve/undo/falls) + Next.
- **Game Complete:** `AFTERGLOW RESTORED` + Restart + stats.
- **Fail:** 페이지 전환 없이 0.15s 페이드 후 리스폰.

---

## 9. 레벨 데이터 형식 — `game/levels.js`
**5개 레벨의 확정 좌표·소켓·패널·게이트·기대해법·검증단언은 `docs/LEVELS.md`에 전부 명시됨.** 여기서는 스키마만:
```js
{ id, name, width, height, start:{x,z}, exit:{x,z},
  interiorWalls:[{x,z}...], bouncePanels:[{id,cells:[{x,z}...],normal,albedo}...],
  blocks:[{id,spawnCell:{x,z},colorKey,state:'pickup',on}...], sockets:[{id,cell}...],
  gates:[{cell,gateColor,icon}...]|[], cameraStart:'top'|'chase',
  objective:"...", expectedSolution:[...], validateAsserts:[{mode,afterPlace:[[blockId,socketId]...],cell,expected}...] }
```
> floor = 테두리·`interiorWalls` 제외한 모든 내부 셀(ASCII 파싱 불필요). start·exit는 `alwaysSolid=true`. 블록은 `spawnCell`에 `pickup`(소켓 아님).
> 각 레벨은 로드시 `validateLevel()`(§3.7)을 통과해야 함 — 단언은 `docs/LEVELS.md`의 레벨별 정의를 그대로 데이터화.

---

## 10. 에셋 파이프라인 — `scripts/fetch-assets.mjs`
다운로드·정규화·**실패 시 graceful fallback**(절차적 CanvasTexture). 런타임 원격 fetch 금지, 전부 `public/`. **다운로드 실패해도 fallback 안내 출력 후 exit code 0**(빌드 깨지지 않게).
ambientCG URL 형식: `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`.
| 폴더 | ID(검증됨) |
|---|---|
| floor_tile | **PavingStones033** |
| wall_rock | **Rock013** |
| bounce_panel | **Concrete042A** |
| gate_stone | floor 재사용 |
캐릭터: `RobotExpressive.glb`(CC0, Tomás Laulhé)
`https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb` (mirror: `https://threejs.org/examples/...`). 실패 시 절차적 캡슐 로봇.

정규화 매핑: `*Color/BaseColor/Albedo/Diffuse→basecolor.jpg`, `*NormalGL→normal.jpg`(없으면 `*Normal`), `*Roughness→roughness.jpg`, `*AO/AmbientOcclusion→ao.jpg`.
texture 설정: basecolor/emissive=`SRGBColorSpace`, normal/rough/ao=`NoColorSpace`; `RepeatWrapping`; floor=타일당 UV 0..1, wall/panel=물리크기 비율 repeat; AO 사용 geometry는 uv2=uv 복제; anisotropy ≤8.

---

## 11. 디버그 / 리포트 캡처 — `report/capture.js`
C키로 현재 상태 기준 권장 스샷명 출력. 필수 15개:
```
01_title  02_l1_direct_before  03_l1_direct_after  04_l2_direct_only_fail
05_l2_gi_bounce_success  06_surfel_debug_points  07_bounce_pass_direct
08_bounce_pass_1  09_bounce_pass_2  10_color_mixing  11_color_gate_locked
12_color_gate_open  13_robot_animation  14_uv_normalmap_closeup  15_game_complete
```
`REPORT.md`: 컨셉·조작·시스템구조·L4/L5/L6/L8 매핑·색상·한계/폴백 + 위 캡처. "full DDGI/정확한 SurfelGI" 주장 금지 → "CPU SurfelGI-style radiosity approximation".

---

## 12. 빌드 순서(마일스톤)
1. 스캐폴드(트리·Vite·constants·math) + 방·타일격자·텍스처 + 캐릭터·카메라 + 직접광만 → **1차 배포**.
2. `SurfelSolver`(direct+bounce) + `applyGI` + G/B 토글 → 타일 채색·color bleeding.
3. walkable+코요테+버퍼+낙사/리스폰 + 블록 배치/색순환 + undo/reset → L1.
4. L2 바운스 강제 + 디버그 뷰 + 텔레그래프/주스.
5. 캐릭터 애니메이션(L6) + 노멀맵(L5) + L3·L4.
6. L5 피날레+색게이트 + HUD/연출 + 성능·폴백.
7. REPORT(캡처) + 최종 배포 + 시크릿창 링크 검증.

---

## 13. 인수 테스트 (완료 전 필수)
```
npm install
npm run fetch-assets      # 다운로드 실패해도 exit 0 (fallback)
npm run validate:levels   # 5개 레벨 단언 통과 (headless)
npm run build             # = validate:levels && vite build, 반드시 통과
```
- **`npm run validate:levels`가 5개 레벨 전부 통과**(headless 단언, `docs/LEVELS.md` 기준).
- Title→L1 진입, L1~L5 전부 디버그 없이 클리어.
- L2: DIRECT_ONLY 실패 / GI 성공이 명확히 다름. G/B가 경로/패스를 가시적으로 바꿈.
- walkable이 solver 상태와 일치, void 타일은 못 밟음.
- 코요테/버퍼 체감 공정, undo·reset 동작, 소프트락 불가.
- RobotExpressive 로드 또는 절차적 폴백, 텍스처 폴백 동작.
- 배포 링크 시크릿창에서 열림. README·REPORT 갱신.

## 14. 배포
Vite `base`(GitHub Pages면 `/<repo>/`) 설정 + 모든 에셋 `import.meta.env.BASE_URL` 참조. Pages는 git 소유자가 진행. 안정성 우선이면 Vercel/Netlify도 가능. **매 마일스톤 배포 유지**, GI off 폴백 보장.
