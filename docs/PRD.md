# PRD — AFTERGLOW

## 1. 개요
| 항목 | 내용 |
|---|---|
| 게임명 | AFTERGLOW |
| 부제 | 빛이 닿은 곳만 길이 된다 |
| 장르 | 3D grid-based light puzzle platformer |
| 플랫폼 | 웹 (three.js + Vite, 데스크톱 브라우저) |
| 한 줄 규칙 | 발광 블록의 빛이 직접/간접 bounce로 바닥 surfel에 충분히 닿으면 그 타일이 solid/walkable이 된다 |
| 핵심 기술 | CPU SurfelGI-style radiosity (강의 L8) |

## 2. 핵심 플레이 루프
```
발광 블록 배치(또는 이동/색변경)
 → CPU Surfel Radiosity 계산(direct + bounce1 + bounce2)
 → 바닥 타일 irradiance 갱신
 → 밝기 임계값 이상 타일만 walkable
 → 빛의 길을 만들어 출구(exit) 도달 → 다음 레벨
```
직접광만으로는 닿지 않는 코너 뒤 타일을 **벽에 빛을 튕겨(bounce)** 살려야 풀리는 구간이 핵심 "aha".

## 3. 절대 원칙 (2-레이어)
| 레이어 | 책임 | 성질 |
|---|---|---|
| Logic | walkable 판정, 승패, 색 게이트, 낙사 | **CPU 결정적** (GPU readback 금지) |
| Visual | 머티리얼 색/emissive, point light, bloom, debug | 로직 값을 표시만 |
두 레이어는 **동일한 surfel irradiance**를 공유한다 → "보이는 대로 밟힌다" 보장.

## 4. 기술 방향 — 왜 SurfelGI(CPU radiosity)인가
| 후보 | 판단 |
|---|---|
| DDGI | fixed 3D probe grid → 빈 공간에도 probe, 타일 walkable과 직접 연결 어려움 → **불채택** |
| SurfelGI | floor/wall 타일 자체가 surface-attached surfel → 게임 규칙과 1:1 → **채택** |
| CPU radiosity | walkable을 GPU readback 없이 결정적으로 → **채택** |
| Shader GI | 시각은 좋으나 walkable 판정과 불일치 위험 → 시각 폴리시로만(선택) |

리포트/README 표기(정직성):
> This project implements a **SurfelGI-style CPU radiosity approximation**. It is **not** a physically accurate DDGI or full real-time SurfelGI renderer. The goal is to make surface-attached lighting cache, indirect bounce, and radiance reuse **visible and playable as game rules**.

## 5. 게임 시스템 (공정성 필수)
| 시스템 | 규칙 | 기본값 |
|---|---|---|
| 이동 | v2: 1인칭 free continuous WASD, camera-relative | Pointer lock mouse-look |
| 코요테 타임 | continuous foot sample이 void로 바뀐 뒤 유예 | ~100ms |
| 입력 버퍼 | E/Q/Z/R/G/B 등 action 입력 버퍼 | ~100ms |
| 타일 전이 | 즉시 사라짐 금지, 텔레그래프 후 전환 | 0.3~0.5s |
| 낙사 | 발밑 non-walkable + 코요테 만료 → 추락 | 즉시 |
| 리스폰 | 체크포인트 페이드 | ~0.35s |
| 언두 | 블록 명령 스택 기반 무제한 | Z |
| 리셋 | 레벨 상태 초기화 | R |
| 소프트락 방지 | 블록은 **소모 없음·재배치 가능**, **socket에만 배치** | — |
| 타일 가독성 | solid/void를 밝기+엣지+패턴으로 표시(색 단독 금지) | — |

## 6. 색상 시스템
- 가산 RGB. **White=만능(전 스펙트럼)**, 색 블록=색 바운스, 두 색광 겹치면 가산 혼합.
- 팔레트(Okabe–Ito 기반, 휘도까지 구분) + 도형 아이콘 중복:

| 역할 | 이름 | HEX | 아이콘 |
|---|---|---|---|
| 중립 | White | `#FFFFFF` | ◇ |
| 적 | Vermillion | `#D55E00` | ▲ |
| 녹 | Bluish-green | `#009E73` | ■ |
| 청 | Blue | `#0072B2` | ● |
| (예비) | Orange | `#E69F00` | ◆ |

- **White/색게이트 규칙(충돌 해소):** White는 *일반 타일*엔 만능. 그러나 **색 게이트는 white로 못 연다**(white는 chroma≈0). 색 게이트 = `hueMatchesGate(E, target)` = `밝기 ≥ GATE_ON AND chroma ≥ MIN_CHROMA AND hueDot(target) ≥ HUE_DOT`. → white+color 혼합으로 color 성분이 유지되면 통과. (함수명/식은 IMPLEMENTATION_GUIDE §3.4)
- **carried/placed 규칙:** 들고 있는 블록은 직접광·짧은 반경·bounce 미참여(이동용). 소켓에 **배치해야** 전체 강도+bounce+영속. start·exit 패드는 항상 solid. (상세 LEVELS.md 공통 규칙)

## 7. 레벨 (5개, introduce→use→combine)
| 레벨 | 목표 | 블록 | 핵심 |
|---|---|---|---|
| L1 | 직접광으로 길 만들기 | white 1 | socket에 놓으면 직선 경로 점등(튜토리얼) |
| L2 | 코너 뒤 타일 살리기 | white 1 | **단일 bounce 필수**(direct only로는 실패) = aha |
| L3 | 거리/2-bounce 조절 | white 1 | bounce1/bounce2 차이 |
| L4 | 두 빛 조합 | white 2 (or +color) | additive irradiance로 다리 완성 |
| L5 | 색 게이트 통과(피날레) | red/green/blue (+white) | 밝기+hueMatch, 난도보다 스펙터클 |
전체 플레이 3~6분. 클리어=exit 도달, 최종=Game Complete.

> **"GI-off fallback"의 정확한 의미:** 앱이 구동 불능이 되지 않고 direct-light 베이스라인이 보이는 것(엔진 항상 동작). **모든 레벨이 GI off로 클리어 가능하다는 뜻이 아니다.** L2는 의도적으로 GI/bounce가 있어야만 풀린다.

## 8. 범위 / 비목표 (Non-goals)
**만들지 않는다:** 스캐너 ray 게임플레이, glow plant, 중앙 게이트 스캔, 동굴 탈출, DDGI probe grid, **게임플레이용 GPU readback**, 물리적으로 정확한 SurfelGI. 1인칭은 v2의 조작/카메라 방식일 뿐, 별도 공포 탐험/스캐너 장르로 확장하지 않는다. (이전 비행기 게임 로직도 폐기.)

## 9. 강의 이론 매핑 (리포트 40점, 전부 자체 캡처)
| 이론 | 구현 | 캡처 |
|---|---|---|
| 변환·쿼터니언·행렬 카메라(이전 Lab) | Player/cameraRig | 이동·회전·3카메라 |
| L4 렌더링 방정식 Le+∫ | 직접/바운스 분리 | 직접만/적분만/합 |
| L4 광원·emissive | EmissiveBlock + point light | 배치 장면 |
| L4 BRDF·코사인 적분 | SurfelSolver formFactor | diffuse 음영 |
| L5 텍스처·UV·노멀맵 | materials | UV repeat, 노멀맵 on/off |
| L6 스켈레톤·애니메이션 | Player(Mixer) | 걷기 + GI 받는 캐릭터 |
| L8 SurfelGI | gi/* | surfel 점, GI on/off, 바운스 수렴, color bleeding |

## 10. 성공 기준 (Acceptance)
- 5레벨 전부 디버그 텔레포트 없이 클리어 가능.
- L2: GI off(direct only)면 실패, GI on이면 성공이 **눈에 띄게** 다름.
- walkable 타일이 CPU solver 상태와 정확히 일치(보이는 대로 밟힘).
- 코요테/버퍼/언두/리셋 동작, 소프트락 불가.
- `npm run build` 통과, 에셋 다운로드 실패해도 절차적 폴백으로 동작.
- GitHub Pages(또는 Vercel) 링크가 시크릿창에서 열림.
- REPORT.md에 15개 캡처 + 이론 매핑 작성.
