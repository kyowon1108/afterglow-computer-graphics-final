# LEVELS — AFTERGLOW (고정 실행 설계)

`game/levels.js`에 그대로 들어갈 5개 레벨의 **확정 명세**. 좌표·소켓·패널·게이트·기대 해법·검증 단언 포함.

> **정답 계약 = 각 레벨의 `validateAsserts` + `validateLevel()`.** ASCII는 **비공식 스케치(파서 입력 아님)**. 좌표 필드가 ASCII와 다르면 **좌표 필드가 우선**한다. floor 셀은 "테두리·`interiorWalls`를 제외한 모든 내부 셀"로 levelBuilder가 자동 산출(ASCII 파싱 불필요).

## 좌표 규약
- `cell={x,z}`. x=열(0..width-1), z=행(0..height-1). 테두리(x=0/​width-1, z=0/​height-1)는 항상 벽.
- `worldX=(x-width/2)*TILE_SIZE`, `worldZ=(z-height/2)*TILE_SIZE`.
- **발광/샘플 높이(필수):** 블록은 바닥면이 아니라 `BLOCK_LIGHT_HEIGHT=0.85`에서 발광, floor surfel은 `FLOOR_SURFEL_HEIGHT=0.04`, wall surfel은 `WALL_SURFEL_HEIGHT=1.0`. (이걸 안 하면 floor normal(0,1,0)과 동일 높이 블록 방향이 수평→`cosθ=0`→직접광 0이 됨.)

## 공통 고정 규칙 (모든 레벨)
1. **start·exit 패드는 항상 solid**(`alwaysSolid=true`, 빛 무관). → **direct-only 실패 단언은 exit 셀이 아니라 그 직전 entry 타일에 건다.**
2. **블록 초기 상태 = `pickup`(소켓 아님).** 블록은 `spawnCell`에 놓여 있고 **placed가 아니다.** `pickup` 블록은 빛을 내지 않으며(또는 매우 약함), 플레이어가 집으면 `carried`가 된다.
3. **`spawnCell`은 start 패드에 인접**(또는 alwaysSolid 타일 위)이어야 한다 → 레벨 시작 시 항상 집을 수 있음(닭-달걀 방지). `validateLevel`이 검사.
4. **carried = 직접광·짧은 반경(`CARRY_RADIUS`)·bounce 미참여.** **placed(소켓에만) = 전체 강도+bounce+영속.** 멀리/코너는 placed로만.
5. 블록은 소모되지 않음, 항상 회수·재배치. 배치는 **소켓에만**.
6. 색 게이트는 white로 못 연다: `luminance≥GATE_ON AND chroma≥MIN_CHROMA AND hueDot(target)≥HUE_DOT`.

## 블록/레벨 스키마 (확정)
```js
{
  id, name, width, height,
  start:{x,z}, exit:{x,z},                 // 둘 다 alwaysSolid
  interiorWalls:[{x,z}...],                // 테두리 외 추가 벽 (floor = 나머지 내부 셀)
  blocks:[{ id, spawnCell:{x,z}, colorKey, state:'pickup', on:true }],   // 비소켓 spawn, placed 아님
  sockets:[{ id, cell:{x,z} }],            // placed 가능 위치(여기에만 배치)
  bouncePanels:[{ id, cells:[{x,z}...], normal:'+x'|'-x'|'+z'|'-z', albedo:0xF2F0E6 }],
  gates:[{ cell:{x,z}, gateColor:'red'|'green'|'blue', icon }],
  cameraStart:'top'|'chase', objective:"...",
  expectedSolution:[...],
  validateAsserts:[{ mode, afterPlace:[[blockId,socketId]...], cell:{x,z}, expected:bool }]
}
```
> `afterPlace`는 "해당 블록을 해당 소켓에 placed 상태로 둔 뒤 solve" 시뮬레이션. 빈 배열=초기 상태.

---

## L1 — Direct & Placement Tutorial  (8×4, top)
sketch: `#SB.o.X#` (z1, 비공식)
```js
{ id:1, name:'First Light', width:8, height:4,
  start:{x:1,z:1}, exit:{x:6,z:1}, interiorWalls:[],
  blocks:[{id:'b1', spawnCell:{x:2,z:1}, colorKey:'white', state:'pickup', on:true}],
  sockets:[{id:'s1', cell:{x:4,z:1}}],
  bouncePanels:[], gates:[], cameraStart:'top',
  objective:'블록을 소켓에 놓아 출구까지 길을 켜라.',
  expectedSolution:['(2,1)에서 b1 픽업','(4,1) 소켓에 배치','(5,1) 점등 → 출구(6,1) 도달'],
  validateAsserts:[
    {mode:'GI', afterPlace:[],            cell:{x:5,z:1}, expected:false},
    {mode:'GI', afterPlace:[['b1','s1']], cell:{x:5,z:1}, expected:true}
  ] }
```
screenshots: `02_l1_direct_before`(배치 전), `03_l1_direct_after`(배치 후).

## L2 — Single Bounce (the aha)  (7×6, top)
직접광은 코너 너머 exit 진입 타일에 못 닿고, **bounce 패널 없이는 entry 타일이 void.**
sketch:
```
#######
#SB.o.#
####.##      (z2: x5 연결 통로만 열림)
#....##
#X...##      (z4: exit(1,4) + 진입 타일들)
#######      (z5 하단 = bounce 패널 면, +z 향)
```
```js
{ id:2, name:'Around the Corner', width:7, height:6,
  start:{x:1,z:1}, exit:{x:1,z:4},
  interiorWalls:[{x:1,z:2},{x:2,z:2},{x:3,z:2},{x:4,z:2}],   // z2: x5만 연결 통로
  blocks:[{id:'b1', spawnCell:{x:2,z:1}, colorKey:'white', state:'pickup', on:true}],
  sockets:[{id:'s1', cell:{x:5,z:1}}],
  bouncePanels:[{id:'w1', cells:[{x:1,z:5},{x:2,z:5},{x:3,z:5},{x:4,z:5}], normal:'-z', albedo:0xF2F0E6}],
  gates:[], cameraStart:'top',
  objective:'정면은 막혔다. 빛을 벽에 튕겨 코너 뒤를 켜라.',
  expectedSolution:['b1 픽업','(5,1) 배치','연결통로(5,2) 하강','W가 (2,4) 등 entry 타일로 bounce → 출구(1,4)'],
  validateAsserts:[
    // entry 타일(2,4)에 단언 — exit 셀(1,4)은 alwaysSolid라 단언 대상 아님
    {mode:'DIRECT_ONLY', afterPlace:[['b1','s1']], cell:{x:2,z:4}, expected:false},
    {mode:'GI',          afterPlace:[['b1','s1']], cell:{x:2,z:4}, expected:true}
  ] }
```
screenshots: `04_l2_direct_only_fail`, `05_l2_gi_bounce_success`, `06_surfel_debug_points`.

## L3 — Distance & Two-Bounce  (11×5, top)
한 블록으로 **bounce2까지** 가야 먼 entry 타일이 켜진다.
```js
{ id:3, name:'Long Throw', width:11, height:5,
  start:{x:1,z:1}, exit:{x:10,z:3},
  interiorWalls:[],
  blocks:[{id:'b1', spawnCell:{x:2,z:1}, colorKey:'white', state:'pickup', on:true}],
  sockets:[{id:'s1', cell:{x:4,z:1}}],
  bouncePanels:[{id:'w1', cells:[{x:9,z:2}], normal:'-z', albedo:0xF2F0E6},
                {id:'w2', cells:[{x:8,z:2}], normal:'-x', albedo:0xF2F0E6}],
  gates:[], cameraStart:'top',
  objective:'멀다. 한 번이 아니라 두 번 튕겨야 닿는다.',
  expectedSolution:['b1 (4,1) 배치','W1→W2 2차 bounce로 (9,3) 점등','출구(10,3) 도달'],
  validateAsserts:[
    {mode:'BOUNCE1', afterPlace:[['b1','s1']], cell:{x:9,z:3}, expected:false},
    {mode:'GI',      afterPlace:[['b1','s1']], cell:{x:9,z:3}, expected:true}
  ] }
```
screenshots: `07_bounce_pass_direct`, `08_bounce_pass_1`, `09_bounce_pass_2`.

## L4 — Two-Block Additive  (9×6, top)
두 블록의 빛이 **가산**으로 겹쳐야 중앙 다리 타일이 임계값을 넘는다.
```js
{ id:4, name:'Meet in the Middle', width:9, height:6,
  start:{x:1,z:3}, exit:{x:7,z:3},
  interiorWalls:[],
  blocks:[{id:'b1', spawnCell:{x:2,z:3}, colorKey:'white', state:'pickup', on:true},
          {id:'b2', spawnCell:{x:3,z:3}, colorKey:'white', state:'pickup', on:true}],
  sockets:[{id:'s1', cell:{x:3,z:1}}, {id:'s2', cell:{x:5,z:1}}],
  bouncePanels:[], gates:[], cameraStart:'top',
  objective:'한 빛으로는 부족하다. 두 빛을 겹쳐라.',
  expectedSolution:['b1→s1, b2→s2 배치','(4,3)가 가산으로 점등 → 출구'],
  validateAsserts:[
    {mode:'GI', afterPlace:[['b1','s1']],            cell:{x:4,z:3}, expected:false},
    {mode:'GI', afterPlace:[['b1','s1'],['b2','s2']], cell:{x:4,z:3}, expected:true}
  ] }
```
screenshots: `10_color_mixing`(white+white 가산, 또는 색혼합 시연).

## L5 — Finale + Color Gate  (11×5, chase)
본 경로는 쉽고, **마지막 문 1개만 green 게이트**. white로는 안 열린다.
```js
{ id:5, name:'Afterglow', width:11, height:5,
  start:{x:1,z:1}, exit:{x:10,z:4},
  interiorWalls:[],
  blocks:[{id:'b1', spawnCell:{x:2,z:1}, colorKey:'white', state:'pickup', on:true},
          {id:'b2', spawnCell:{x:3,z:1}, colorKey:'green', state:'pickup', on:true}],
  sockets:[{id:'s1', cell:{x:4,z:1}}, {id:'s2', cell:{x:9,z:2}}],
  bouncePanels:[{id:'w1', cells:[{x:5,z:3}], normal:'+z', albedo:0xF2F0E6}],
  gates:[{cell:{x:9,z:3}, gateColor:'green', icon:'square'}],
  cameraStart:'chase',
  objective:'마지막 문은 초록 빛이 필요하다.',
  expectedSolution:['b1(white) s1 배치로 본 경로 점등','b2(green) s2 배치','g(9,3) hueMatch → open → 출구(10,4)'],
  validateAsserts:[
    {mode:'GI', afterPlace:[['b1','s1']],            cell:{x:9,z:3}, expected:false}, // white만 → chroma 부족
    {mode:'GI', afterPlace:[['b1','s1'],['b2','s2']], cell:{x:9,z:3}, expected:true}
  ] }
```
screenshots: `11_color_gate_locked`(white만), `12_color_gate_open`(green), `15_game_complete`.

---

## validateLevel() — headless 실행 (`scripts/validate-levels.mjs`)
DOM/Three 렌더러 없이 `levels.js` + `SurfelSolver.js` + `rules.js`만 import해 순수 계산으로 검증.
```js
validateLevel(level):
  assert tileAt(start).alwaysSolid && tileAt(exit).alwaysSolid
  for b in level.blocks: assert isAdjacent(b.spawnCell, start) || tileAt(b.spawnCell).alwaysSolid   // 픽업 가능성
  for a in level.validateAsserts:
     resetBlocksToPickup(level)
     for [bid,sid] in a.afterPlace: placeBlockOnSocket(bid, sid)   // placed 상태로
     solve(level, a.mode)
     assert walkable(a.cell) === a.expected
  applyExpectedSolution(level); solve(level,'GI')
  assert pathExists(start → exit, walkableTiles)        // 최종 클리어 가능
  assert noStrandingDuringSolution(level)               // 단계 사이 항상 walkable 경로
```
`package.json`:
```json
"scripts": {
  "validate:levels": "node scripts/validate-levels.mjs",
  "build": "npm run validate:levels && vite build"
}
```
> 빌드가 레벨 검증을 강제하도록 build 앞에 건다. solver/levels/rules는 **브라우저 비의존**(Three 객체 직접 생성 금지, 순수 수학)으로 작성해 Node에서 import 가능해야 한다.

## Wall surfel 생성 규칙
- bounce 패널은 **`cells` 배열의 셀마다 wall surfel 1개**. `normal`은 플레이 가능한 바닥 쪽.
- 일반 `interiorWalls`/테두리 벽은 **occlusion(가림)만**(visibility.js), bounce surfel 생성 안 함. `bouncePanels`만 bounce 소스.
