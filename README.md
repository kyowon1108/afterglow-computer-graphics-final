# AFTERGLOW — 빛이 닿은 곳만 길이 된다

3D grid-based light puzzle platformer. **발광 블록이 만든 직접광/간접광(CPU SurfelGI-style radiosity)이 임계값 이상 닿은 바닥 타일만 밟을 수 있다.** 플레이어는 빛의 길을 만들어 출구에 도달한다. **GI는 시각 효과가 아니라 게임 규칙 그 자체.**

> 컴퓨터그래픽스 기말 과제. 채점: 기획(20)·완성도(20)·GI(SurfelGI, 20)·리포트(40). 게임 미동작/리포트 누락 시 0점.

## 이 폴더는 무엇인가
**실행 가능한 Vite + Three.js 게임 구현과 구현 명세(spec) 모음**이다. `src/`는 런타임 코드, `docs/`는 설계·컨벤션·레벨 계약의 단일 진실원이다.

```
AFTERGLOW/
  README.md                  ← (이 파일) 진입점 / 실행 순서
  index.html                 ← SPA 진입점
  package.json               ← Vite/npm scripts
  scripts/                   ← asset fallback, headless level validation
  src/                       ← 게임 런타임 구현
  docs/
    CONVENTIONS.md           ← 이름·데이터 모델 단일 진실(FROZEN). 충돌 시 최우선
    PRD.md                   ← 무엇을·왜 만드는가 (요구사항·범위·채점 매핑)
    IMPLEMENTATION_GUIDE.md  ← 어떻게 만드는가 (폴더/파일 배치, 파일별 책임, 알고리즘, 상수, 인수테스트)
    LEVELS.md                ← 5개 레벨 확정 (좌표·소켓·패널·게이트·기대해법·검증단언)
    AGENT_PROMPT.md          ← 구현 에이전트에 그대로 붙여넣는 인계 프롬프트
```

## 읽는 순서
1. `docs/CONVENTIONS.md` — 이름·데이터 모델 freeze(최우선).
2. `docs/PRD.md` — 게임 정의·규칙·레벨·범위.
3. `docs/IMPLEMENTATION_GUIDE.md` — 파일 트리와 파일별 구현 지시(핵심).
4. `docs/LEVELS.md` — 레벨별 확정 좌표·기대해법·검증단언.
5. `docs/AGENT_PROMPT.md` — 구현 시작 시 에이전트에 전달.

## 베이스 코드
`../TheAviator/` (Vite + three.js `^0.184.0` + GSAP). 여기서 **Vite 세팅·카메라/쿼터니언/행렬 개념·헬퍼만 재사용**하고, 비행기 게임 로직은 폐기한다. 새 프로젝트 `AFTERGLOW/`로 재구성.

## 구현 후 실행
```bash
npm install
npm run fetch-assets   # 텍스처/모델 다운로드 (실패해도 절차적 폴백)
npm run dev            # 로컬 개발
npm run build          # 배포 빌드 (반드시 통과)
```

## 절대 원칙 (요약)
- 게임플레이 판정(walkable)은 **CPU 결정적 계산**. GPU readback 금지.
- 가혹한 규칙은 **즉시 리스폰 + 언두 + 리셋 + 재배치 가능 블록**으로 공정하게.
- 신호는 **색 단독 금지**(밝기·아이콘·패턴 중복).
- **항상 플레이 가능**: GI가 막혀도 직접광 폴백으로 앱이 동작. 단 이는 "앱이 계속 실행되고 direct-only 비교가 가능"하다는 뜻이지, **모든 퍼즐이 GI off로 풀린다는 뜻은 아니다**(L2는 의도적으로 bounce 필수).
- DDGI/물리적으로 정확한 SurfelGI라고 주장하지 않음 → "CPU SurfelGI-style radiosity approximation".

## 구현 상태
Vite + Three.js 구현 포함. 핵심 판정은 `src/gi/SurfelSolver.js`의 CPU SurfelGI-style radiosity approximation이 담당한다. GPU readback은 사용하지 않는다.

## 실행
```bash
npm install
npm run fetch-assets
npm run dev
npm run capture:report  # public/report-captures/*.png 생성
```

## 배포
- GitHub repository: https://github.com/kyowon1108/afterglow-computer-graphics-final
- GitHub Pages: https://kyowon1108.github.io/afterglow-computer-graphics-final/

## 조작
- 마우스: 1인칭 시점 둘러보기. 화면 중앙 조준점이 초록색이면 상호작용 대상이다.
- WASD / 방향키: 이동.
- E / 왼쪽 클릭: 블록 집기 또는 소켓에 놓기. 조준이 조금 빗나가도 가까운 블록/소켓은 보조 판정한다.
- Q: 든 블록 색 순환. Z: undo. R: 레벨 리셋.
- G: GI/DIRECT 비교. B: FINAL/DIRECT/BOUNCE1/BOUNCE2 보기.
- M: 위에서 보기(peek). T: 3인칭 보기. F1/V/N: 디버그.

## 검증
```bash
npm run validate:levels
npm run smoke:interactions
npm run build
npm run capture:report
```

`npm run build`는 `npm run validate:levels && vite build`로 레벨 계약을 먼저 검증한다.
`npm run smoke:interactions`는 Playwright로 마우스/E pick-place, ghost, undo, color cycle, reset, GI/B, camera toggles, fall/respawn을 확인한다.
`npm run capture:report`는 Vite dev server를 띄우고 Playwright로 L1-L5를 자동 플레이하며 `REPORT.md`의 15개 캡처를 생성한다.

## 에셋 크레딧 / 폴백
- ambientCG CC0: PavingStones033, Rock013, Concrete042A. 다운로드 실패 시 절차적 CanvasTexture를 사용한다.
- RobotExpressive.glb CC0 by Tomás Laulhé, distributed in the three.js examples. 다운로드 실패 시 절차적 캡슐 로봇을 사용한다.
