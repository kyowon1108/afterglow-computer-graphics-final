# AFTERGLOW — 빛이 닿은 곳만 길이 된다

1인칭 3D 라이트 퍼즐 (Vite + Three.js). 발광 블록을 **조준하고, 거울로 꺾고, 프리즘으로 분광·혼합**해 만든 빛(CPU SurfelGI 근사)이 임계값 이상 닿은 바닥만 밟을 수 있다. 색 게이트를 열어 출구에 도달하면 클리어. **GI는 시각 효과가 아니라 게임 규칙 그 자체다.**

> 컴퓨터그래픽스 기말 과제 · 제작: 이교원

## 링크
- ▶ **플레이:** https://kyowon1108.github.io/afterglow-computer-graphics-final/
- 📄 **리포트:** [`REPORT.md`](./REPORT.md) (슬라이드 PDF: [`AFTERGLOW-report.pdf`](./AFTERGLOW-report.pdf))
- 💻 **코드:** https://github.com/kyowon1108/afterglow-computer-graphics-final

## 조작
| 키 | 동작 | 키 | 동작 |
|---|---|---|---|
| WASD / 방향키 | 이동 | 마우스 | 시점 |
| E / 좌클릭 | 블록 집기·놓기(소켓) | 휠 / `[` `]` | 블록·거울 회전 |
| Q | 색 변경 | Z / R | 되돌리기 / 다시하기 |
| G / B | GI 비교 / 패스 보기 | M / T | 위에서 보기 / 3인칭 |
| ? / Esc | 도움말 / 메뉴 | | |

## 실행
```bash
npm install
npm run fetch-assets   # 텍스처·모델 다운로드 (실패해도 절차적 대체)
npm run dev            # 로컬 플레이
npm run build          # = validate:levels && vite build
```
> `npm run validate:levels`는 모든 레벨을 headless로 검증한다 — 정확 출구·전 게이트 개방이라야 클리어, **의도 외 클리어(치즈)는 0개**까지 단언한다.

## 강의 이론 매핑 (자세히는 `REPORT.md`)
- **L4 조명·렌더링 방정식** — 발광 블록 = Lₑ, 직접광은 코사인·역제곱·가림·조준 원뿔로 계산.
- **L8 SurfelGI** — 표면 surfel에 직접광 + 2회 바운스(form factor)를 캐싱해 `walkable`을 결정.
- **L5 텍스처·UV·노멀맵** — ambientCG PBR 텍스처(노멀맵은 시각 전용, solver는 geometric normal).
- **L6 스켈레톤·애니메이션** — RobotExpressive + AnimationMixer.

## 크레딧 (모두 CC0)
- 텍스처: ambientCG — PavingStones033 · Rock013 · Concrete042A
- 캐릭터: RobotExpressive.glb (Tomás Laulhé, three.js examples)
- 규칙 영감: Closure (2012) · GI 기법: EA SEED *GIBS* (SIGGRAPH 2021)
