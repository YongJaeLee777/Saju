# 다음 세션 인수인계

기준일: 2026-09-29 (Asia/Seoul)

## 현재 상태

- 사주 입력·계산·무료 결과, 유료 상세 리포트, 결제, 최근 결과 탐색까지 MVP 기능 구현 완료. Stack: Astro 6 + Cloudflare Workers + D1 + Drizzle + Vitest.
- Kakao Pay **test** 결제 정상 동작 확인. ready/approve/cancel/fail 처리와 reconciling 주문조회 기반 복구 구현 완료.
- 만료된 preparing/approving lease 복구 및 purchase 1건용 manual reconcile CLI 구현 완료. 자동 Cron은 없음.
- 중앙 payment config로 test/live 분리 완료. 현재 `KAKAOPAY_ENVIRONMENT=test`, `KAKAOPAY_CID=TC0ONETIME`. 실제 live CID/Secret 전환은 아직 하지 않음. Secret은 Worker secret 방식 유지.
- profile 생성과 결제 ready에 buyer 기반 Rate Limiting 적용 완료.
- 사용하지 않는 Astro SESSION KV와 Cloudflare IMAGES 자동 binding 제거 완료. 운영 오류 확인용 observability 설정은 유지.
- D1 query/index 비용 점검 완료. ready의 중복 buyer read 제거, approve/reconcile purchase 조회의 필요한 컬럼 projection 적용. schema/migration 변경 없음.
- 브라우저 localStorage 최근 결과 history(`/history`) 구현 완료: 최대 20개, 중복 최신화, 개별·전체 삭제. 결제 권한은 서버 entitlement/snapshot 검증으로만 판단.
- `/result/{profileId}` 상단에 `메인으로` 링크 추가 완료. 모바일/데스크톱 Kakao redirect 분기도 구현됨.
- R2 미사용, 로그인 미구현.

## Narrative 상품 흐름 (현재 코드 기준)

- 무료 결과: OpenAI 호출 0회, deterministic Free Hook 한 문장과 1,000원 Kakao Pay CTA. 기존 12개 locked headline preview는 production에서 제거됨.
- 유료 결과: entitlement 확인 → 최초 조회에서 AI Narrative 최대 1회로 12장 제목·본문 생성 → snapshot 저장·재사용. 실패한 장만 deterministic fallback. 재조회는 snapshot을 사용하며 retry 없음.
- 12장에는 primary / secondary / neutral_bridge / synthesis coverage가 있다. 검증된 source를 narrativeAngle별로 재사용하되 새 FACT/CLAIM, 관계·내면·반복 문제의 근거 없는 해석은 금지. AI는 해석이 아닌 한국어 작문을 맡으며 v3에서 내부 분석어를 생활 언어로 옮기도록 조정했다.
- 모델은 `gpt-5.6-luna`. 12장을 한 API 요청으로 생성하며 장별 호출은 하지 않는다.
- dev CLI는 실제 코드상 `node scripts/narrative-review.mjs --fixture <1-5>`를 지원한다. 한 번에 하나만 선택하고 최대 1회 호출한다. `--all`은 없다.
- fixture 1 실호출 최신 결과(사용자 검수): 호출 1회, 약 24.8초, input 11,760 tokens / output 2,521 tokens, fallback·validation reject·global failure 모두 없음. 이전 chapter 12 `invalid_source_ref`는 수정 후 정상 통과했다.
- 문체는 deterministic 대비 크게 개선됐고 6/8장, 9~11장, closing의 방향이 좋다. 일부 분석어 잔존 가능성은 다른 fixture와 비교한 뒤 판단한다.

## 검증·배포 상태

- 최근 `npm run check`: 105 files, 0 errors / 0 warnings / 0 hints (history 타입 오류 수정 후 실행). 이후 결과 페이지의 단순 메인 링크 추가에 대해서는 check를 재실행하지 않음.
- `typecheck`는 package script상 `npm run check`와 동일. 별도 재실행 기록 없음.
- 가장 최근 관련 테스트: 결과·결제 UI 2 files / 14 tests 통과. 그 직전 history·결과·profile rate limit·결제 UI 4 files / 21 tests 통과. 최근 변경 전체에 대한 full suite는 재실행하지 않음.
- 최근 변경 전체에 대한 build 성공 기록 없음. 과거 build 성공 기록은 있으나 현재 작업 트리의 검증 결과로 간주하지 않음.
- 최근 payment/history/UI 변경의 배포는 이 세션에서 수행하지 않았으며 현재 production 반영 여부 미확인. 작업 트리에 미커밋 변경이 있으므로 다음 세션에서 검증 후 배포 여부를 판단할 것.

## 다음 세션 최우선: fixture 실물 검수

1. `node scripts/narrative-review.mjs --fixture 2`를 수동 실행하고 12장 제목·본문의 품질을 검수한다.
2. 이후 fixture 3 → 4 → 5를 **각각 한 번씩** 실행해 비교한다. 자동 반복 실행은 하지 않는다.
3. 사람별 이야기·문법의 차이, fixture 5의 실제 relationship/recurring claim이 5/8장에 반영되는지, 9~11장 시간축의 차이, closing의 motif/claim 회수를 확인한다.
4. 5개 결과를 보기 전에는 allocation·prompt·model을 성급하게 바꾸지 않는다. 구조 개선 후에도 Luna 품질이 부족할 때만 동일 Brief로 Sol A/B를 검토한다.

무료 AI 0회, 유료 purchase/report당 최대 1회, snapshot 재사용과 retry 없음 정책을 유지한다. D1 full scan과 불필요한 row read를 피한다. 유료 생성이 약 20~25초 걸린 실측이 있어 추후 생성 중 UX를 검토하되, 지금은 품질 검수가 우선이다. 결제·DB·상태머신은 이 검수에서 변경하지 않는다.

## 보안 메모

- Secret, 결제 인증값, 거래 식별자, 주문 식별자, 상태 토큰의 실제 값은 문서·로그에 기록하지 말 것.
- localStorage의 history는 이동 힌트이며 유료 콘텐츠 접근 권한이 아니다.
