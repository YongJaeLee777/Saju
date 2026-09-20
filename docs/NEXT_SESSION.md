# 다음 세션 메모

## 현재 목표

Kakao Pay 단건결제 MVP 흐름을 `ready → approve → entitlement/snapshot` 순서로 완성한다.

## 현재까지 구현된 것

- payment DB 테이블 4개: `anonymous_buyers`, `purchases`, `report_snapshots`, `report_entitlements`
- anonymous buyer 생성·해시 저장·쿠키 인증
- entitlement 인증 후 snapshot을 조회하는 서버 전용 access 함수
- Kakao ready service와 `POST /api/payments/kakaopay/ready` route
- 테스트 결제 CID `TC0ONETIME`, deterministic report draft freeze
- DEV 환경에서 `localhost`/`127.0.0.1` HTTP callback origin 허용
- DEV 전용 outbound diagnostic route: Kakao와 `example.com` HTTPS HEAD 비교
- ready fetch의 redirect 옵션은 `manual`

## 아직 하지 않은 것

- remote migration은 아직 하지 않음
- approve 구현 안 함
- callback 구현 안 함
- 결제 UI 구현 안 함
- rate limit 구현 안 함

## 핵심 진단 결과

1. 최초 ready 실호출: HTTP 502, purchase `ready / reconciling`, `last_error_code=provider-network`
2. 오류 분류 세분화 후: `provider-network-fetch-typeerror-unknown`
3. 같은 Worker runtime outbound 진단:
   - Kakao HEAD: `fetchSucceeded=true`, HTTP 404
   - `example.com`: `fetchSucceeded=true`, HTTP 200
   - outbound/TLS 자체는 정상
4. ready fetch의 `redirect: 'error'`를 `redirect: 'manual'`로 변경
5. 변경 후 ready 실호출: HTTP 502, 새 purchase 생성, `failed / complete`, `last_error_code=provider-rejected`, `tid=false`, entitlement/snapshot 미생성
6. 이전 TypeError의 직접 원인은 redirect 처리였고, 현재는 Kakao 서버까지 도달한 뒤 400/401/403/422 중 하나로 거절되는 단계

## 다음 시작점

- 실제 ready 재호출 전에 `provider-rejected` 진단을 최소 보강
- HTTP status와 Kakao JSON의 numeric `error_code`만 안전하게 `last_error_code`에 남김
- `error_message`, extras, response body 원문은 저장·로그하지 않음
- 기존 `failed / complete` 및 외부 502 정책 유지
- 수정 후 사용자가 dev 서버를 재시작
- ready를 정확히 1회 호출
- `error_code` 기준으로 Secret Key/API 권한/도메인/요청값 원인 확정

## 보안·운영 상태

- secret, Authorization, tid, orderId 전체값 로그 금지
- `pg_token` 저장·로그 금지
- ready 재시도 남발 금지
- remote migration 금지 상태
- 공개 운영 전 rate limit과 Turnstile 필요
- paid unlock은 approval_url 도착이 아니라 server approve와 verify 이후
- D1 full scan 금지; entitlement 먼저 확인 후 snapshot 조회

## 현재 테스트 상태

- redirect manual 변경 후 service 57개, route 39개, 총 96개 통과
- 이후 실제 ready 1회 호출로 `provider-rejected` 확인
- full regression은 다시 돌리지 않음

## 기존 프로젝트 메모

- deterministic report 파이프라인 완료
- LLM은 실험과 semantic guard/deterministic fallback 구현까지 완료했으며 MVP 기본 사용은 보류
- `/result/[id]`에 DB profile → 계산 → 대운/2026 세운 → Facts → Signals → TopicSummary → renderer → deterministic report 연결 완료
- 대표 1991-01-02 13:04 여성 화면 검증 완료
- 일반 작업에서 `SAJU_DEVELOPMENT_LOG.md`는 읽지 않음
- 작은 작업은 관련 파일과 관련 테스트만 실행
