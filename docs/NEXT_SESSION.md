# 다음 작업 메모

- 현재 검증 상태: 전체 회귀 check/typecheck 통과, 29 files / 402 tests 통과, build 통과
- deterministic report 파이프라인 완료
- LLM은 `gpt-5.6-luna` 실험을 완료했으며 semantic guard와 deterministic fallback을 구현했다. MVP 기본 사용은 보류한다.
- `/result/[id]`에 DB profile → 계산 → 대운/2026 세운 → Facts → Signals → TopicSummary → renderer → deterministic report 연결 완료
- 대표 1991-01-02 13:04 여성 화면 검증 완료
- 다음 작업: 결과 페이지 UX v1 개선
- UX 작업에서는 계산/engine/DB schema/LLM 로직을 변경하지 않는다.
- 일반 작업에서 `SAJU_DEVELOPMENT_LOG.md`는 읽지 않음
- 작은 작업은 관련 파일/관련 테스트만 실행
- 전체 검증과 문서 갱신은 여러 기능 후 묶어서 실행
