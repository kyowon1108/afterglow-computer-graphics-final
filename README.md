# AFTERGLOW — 빛이 닿은 곳만 길이 된다

1인칭 3D 라이트 퍼즐(Vite + Three.js). 발광 블록을 **조준·거울 라우팅·프리즘 분광/색혼합**해 만든 빛(CPU SurfelGI-style radiosity)이 임계값 이상 닿은 바닥만 밟을 수 있고, 색 게이트를 열어 **정확한 출구**에 도달하면 클리어. **GI는 시각효과가 아니라 게임 규칙 그 자체.**

> 컴퓨터그래픽스 기말 과제. 채점: 기획(20)·완성도(20)·GI(SurfelGI, 20)·리포트(40). 게임 미동작/리포트 누락 시 0점.

---

## 단일 진실원
| 문서 | 역할 |
|---|---|
| **`docs/SPEC.md`** | **유일 통합 사양**(컨셉·규칙·데이터모델·레벨·검증·이론매핑). 충돌 시 최우선. |
| `docs/QA_HANDOFF.md` | 현재 구현 상태, QA 포커스, 검증 스냅샷. |
| `docs/CONVENTIONS.md` | 이름·데이터 모델 freeze(세부). |
| `docs/LEVELS.md` / `docs/MECHANICS_v3.md` | v3 레벨·라우팅 세부 근거. |
| `src/`, `src/game/levels.js` | **실행 진실**(코드가 최종). |
| `docs/archive/` | v1/v2 구버전·중복 문서(**무효, 읽지 말 것**). |

> 과거 `PRD.md`/`IMPLEMENTATION_GUIDE.md`/`AGENT_PROMPT.md`는 옛 grid 게임을 설명해 혼선을 일으켜 `docs/archive/`로 이동했다.

## 현재 상태
로컬 기준으로 레벨 검증, 상호작용 스모크, 리포트 캡처, 프로덕션 빌드가 통과한다. 1인칭 포인터락 온보딩, 휠/`[`/`]` 회전, 한국어 HUD/튜토리얼, 색 게이트/정확 출구 검증, 리포트용 고정 카메라 캡처까지 포함되어 있다.

제출 전 수동 QA는 여전히 권장된다. 특히 L4/L5의 퍼즐 체감, 조명 과노출 여부, 레벨 전환 후 마우스 회복은 브라우저에서 직접 확인하는 편이 좋다.

---

## 실행
```bash
npm install
npx playwright install chromium   # smoke/capture용
npm run fetch-assets              # 텍스처/모델(실패해도 절차적 폴백)
npm run dev                       # 플레이
npm run validate:levels           # 헤드리스 레벨 계약 검증
npm run build                     # = validate:levels && vite build
npm run capture:report            # public/report-captures/*.png 생성
```

## 조작
WASD/방향키 이동 · 마우스 시점 · E/좌클릭 집기·소켓 배치 · `[`/`]`·휠 든 블록/거울 회전 · Q 색 · Z undo · R 리셋 · G GI비교 · B 패스 보기 · M 탑뷰 · T 3인칭 · F1/V/N 디버그 · Esc 메뉴.

## 배포
- GitHub: https://github.com/kyowon1108/afterglow-computer-graphics-final
- Pages: https://kyowon1108.github.io/afterglow-computer-graphics-final/

## 에셋 크레딧 (CC0)
ambientCG: PavingStones033 / Rock013 / Concrete042A (실패 시 절차적 텍스처). RobotExpressive.glb by Tomás Laulhé (three.js examples; 실패 시 절차적 캡슐).

## 기법 출처 / 선행연구 (리포트 인용용)
빛=땅 규칙: Closure(2012). GI 기법: EA SEED **GIBS**(SurfelGI, SIGGRAPH 2021). 웹 surfel GI 선례: Jure Triglav, The Coders Blog. 우리 조합("빛=땅 + 능동 라우팅 + surfel GI")은 선례 미발견 → 독창성.
