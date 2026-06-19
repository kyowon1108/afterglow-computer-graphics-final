# CONVENTIONS (FROZEN) — AFTERGLOW

구현 착수 전 **이름·데이터 모델 단일 진실(single source of truth)**. 충돌 시 이 문서 + `IMPLEMENTATION_GUIDE.md`/`LEVELS.md`가 우선하며, 상위 `../../최종과제_설계서.md`의 상충 표현은 **무효**.

| # | 항목 | 충돌하던 표현 | **확정** |
|---|---|---|---|
| 1 | 유틸 모듈명 | `core/utils.js` (구설계서) | **`core/math.js`** (clamp, luminance, segmentIntersect, cellToWorld 등) |
| 2 | 카메라 모드 | `top/chase/fps` (TheAviator/구설계서) | **v2: `fp` 기본 + `peek` / `third` 보조**. 키: M=peek, T=third. `top/chase/close`는 레거시 입력 alias로만 취급 |
| 3 | E 동작 | "pick/place/**drop**" | **pick / place(소켓에만)**. 중앙 crosshair 대상이 기본이며, 조준이 약간 빗나가면 근접 블록/소켓 보조 판정. **free drop 없음** |
| 4 | 블록 상태 | `carried`/`placed` boolean (구설계서) | **`state: 'pickup' \| 'carried' \| 'placed'`** 단일 필드 + `cell`/`spawnCell` |
| 5 | 블록 발광원(lightPos) | `cell ?? spawnCell ?? playerCell` | **state 분기**: `pickup`=발광 없음 · `carried`=playerCell(direct-only, `CARRY_RADIUS`, no bounce) · `placed`=socket cell(full+bounce) |
| 6 | normalMap ↔ GI | "normalMap이 N 섭동→surfel 음영" (구설계서) | **solver는 geometric normal만**. normalMap은 **visual-only** (CPU solver에 미반영) |
| 7 | wall vs bounce surfel | 혼용 가능성 | `interiorWalls`·테두리 = **occlusion(가림)만** · **bounce source surfel은 `bouncePanels`에서만** 생성 |
| 8 | alwaysSolid 단언 | exit 셀에 direct-only=false 단언 | start·exit는 항상 solid → **실패 단언은 entry/path 타일에** (L2 = `(2,4)`, exit `(1,4)` 아님) |
| 9 | 게이트 판정 함수명 | PRD `hueMatch` vs GUIDE `hueDot` | 함수 **`hueMatchesGate(E, target)`** (내부 `hueDot` 헬퍼). 식은 GUIDE §3.4 |

## 추가 고정 상수 (constants.js, 이미 GUIDE §4 반영)
`BLOCK_LIGHT_HEIGHT=0.85`, `FLOOR_SURFEL_HEIGHT=0.04`, `WALL_SURFEL_HEIGHT=1.0`, `CARRY_RADIUS=1.6*TILE_SIZE`, `CARRY_INTENSITY_SCALE=0.8`, `MIN_CHROMA=0.35`, `WALK_ON=0.60`, `WALK_OFF=0.40`, `GATE_ON=0.60`, `HUE_DOT=0.88`.

## headless 검증 (고정)
`SurfelSolver.js`/`levels.js`/`rules.js`/`math.js`/`visibility.js`/`formFactor.js`는 **Three/DOM 비의존 순수 모듈**. `scripts/validate-levels.mjs`가 Node에서 import해 5개 레벨 단언 통과. `package.json`: `"build": "npm run validate:levels && vite build"`. `fetch-assets`는 실패해도 **exit 0**.

## v2 pivot
현재 구현은 v2 명세에 맞춰 **desktop first-person free movement**가 기본이다. 모바일/터치 UI는 범위 밖이며, `sampleField.js`의 continuous foot sampling이 실제 gameplay ground 판정이다.

> 이 9개를 코드 시작 시점에 그대로 박으면 solver / 레벨 검증 / UI가 서로 다른 "진실"을 갖지 않는다.
