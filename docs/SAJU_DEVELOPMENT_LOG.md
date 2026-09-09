# 사주 서비스 개발 진행 기록

## 문서 목적

이 문서는 현재까지 사주 서비스 MVP를 단계별로 구축하면서 진행한 내용을
사용자 본인이 나중에 다시 읽고 복기할 수 있도록 정리한 기록이다.

단순한 기술 문서가 아니라 다음 내용을 함께 남긴다.

- 왜 이 기술을 선택했는지
- 어떤 순서로 진행했는지
- 각 단계에서 무엇을 확인했는지
- 어떤 문제가 있었고 어떻게 해결했는지
- 앞으로 무엇을 해야 하는지
- 비용 / 성능 / 보안 측면에서 무엇을 주의해야 하는지

현재 프로젝트 기준 경로:

```text
C:\Users\yjh\codex\saju
```

현재 배포 주소:

```text
https://saju.dydcks4.workers.dev/
```

---

# 1. 프로젝트 목표 정리

이 프로젝트의 목적은 복잡한 플랫폼을 만드는 것이 아니라,
**사주 서비스를 빠르게 출시하고 실제 소액 결제가 발생하는지 검증하는 것**이다.

초기 목표:

```text
사주 입력
→ 무료 결과
→ 유료 상세 결과
→ 소액 결제
```

향후 확장 후보:

```text
Google 로그인
Toss Payments
AI 해석
궁합
재물운
직업운
연애운
오늘의 운세
PDF 리포트
```

중요한 원칙:

> 기술적으로 완벽한 구조보다 빠른 출시와 저비용 검증을 우선한다.

---

# 2. 인프라 / 기술 스택 선택

초기에는 다음 후보를 비교했다.

```text
Spring Boot
Next.js + AWS Lambda
Nuxt 4 + Cloudflare
Astro + Cloudflare
AWS Serverless
```

최종적으로 MVP는 다음 조합으로 결정했다.

```text
Astro 6
+
Cloudflare Workers
+
Cloudflare D1
+
Cloudflare R2 (추후)
+
TypeScript
```

선택 이유:

- 서버를 직접 운영하지 않아도 됨
- 초기 비용이 매우 낮음
- Cloudflare CDN / Worker / DB / 파일 저장을 한 플랫폼에서 사용 가능
- SEO 중심 콘텐츠 페이지와 잘 맞음
- 트래픽이 적을 때 비용 부담이 작음
- MVP 단계에서 AWS 인프라 과구성을 피할 수 있음

현재 MVP에서는 AWS를 사용하지 않는다.

---

# 3. Node.js / 프로젝트 생성

로컬 개발 환경은 Node.js 22 LTS 기준으로 맞췄다.

Astro + Cloudflare 프로젝트를 생성하고 배포까지 완료했다.

현재 Cloudflare Worker 배포 주소:

```text
https://saju.dydcks4.workers.dev/
```

이 단계에서 확인한 것:

```text
Browser
→ Cloudflare
→ Astro Worker
→ HTML 응답
```

즉, 기본 배포 파이프라인이 정상 동작함을 먼저 확인했다.

---

# 4. Cloudflare D1 도입

Cloudflare 내부에서 사용할 관계형 데이터베이스로 D1을 선택했다.

D1 특징:

```text
SQLite 기반
Serverless
Workers와 직접 binding 가능
외부 PostgreSQL 불필요
```

D1 생성 후 `wrangler.jsonc`에 연결했다.

현재 binding 이름:

```text
saju_db
```

예시 구조:

```jsonc
"d1_databases": [
  {
    "binding": "saju_db",
    "database_name": "saju-db",
    "database_id": "...",
    "migrations_dir": "drizzle",
    "migrations_pattern": "drizzle/*/migration.sql"
  }
]
```

중요:

```text
database_id
→ 실제 D1 DB 식별자

binding
→ Worker 코드에서 접근하는 이름
```

코드에서는 Astro 6 기준으로:

```ts
import { env } from 'cloudflare:workers'

env.saju_db
```

로 접근한다.

---

# 5. Astro 6 환경 접근 방식 확인

처음에는 이전 Astro 방식인:

```ts
locals.runtime.env
```

를 사용했다.

하지만 Astro 6에서는 제거된 방식이라 에러가 발생했다.

에러 핵심:

```text
Astro.locals.runtime.env has been removed in Astro v6.
```

현재 기준 올바른 방식:

```ts
import { env } from 'cloudflare:workers'
```

예:

```ts
const db = createDb(env.saju_db)
```

앞으로 Astro 5 이하 예제를 그대로 따라가지 않도록 주의한다.

---

# 6. Drizzle ORM 도입

D1에 직접 SQL을 작성할 수도 있지만,
TypeScript 타입 안정성과 migration 관리를 위해 Drizzle을 사용하기로 했다.

구조:

```text
D1
↓
Drizzle
↓
Application Code
```

DB 연결 코드:

```ts
import { drizzle } from 'drizzle-orm/d1'

export function createDb(d1: D1Database) {
  return drizzle(d1)
}
```

의미:

```text
d1
→ 실제 전달된 D1 binding

D1Database
→ Cloudflare D1 객체의 TypeScript 타입

drizzle(d1)
→ D1 위에 Drizzle query layer 생성
```

Drizzle이 데이터를 저장하는 것이 아니다.

```text
실제 데이터 저장
→ D1

쿼리 / 타입 / migration 편의
→ Drizzle
```

---

# 7. Migration 구조 설정

Drizzle schema:

```text
src/db/schema.ts
```

Drizzle 설정:

```text
drizzle.config.ts
```

Migration 생성:

```bash
npx drizzle-kit generate
```

현재 Drizzle 버전에서는 migration 구조가:

```text
drizzle/
└─ xxxx_xxxx/
   └─ migration.sql
```

형태였기 때문에 Wrangler에 다음 설정이 필요했다.

```jsonc
"migrations_dir": "drizzle",
"migrations_pattern": "drizzle/*/migration.sql"
```

Migration 적용 순서:

```text
schema.ts 수정
↓
npx drizzle-kit generate
↓
생성 SQL 직접 확인
↓
로컬 D1 적용
↓
테스트
↓
remote D1 적용
```

로컬:

```bash
npx wrangler d1 migrations apply saju-db --local
```

운영:

```bash
npx wrangler d1 migrations apply saju-db --remote
```

중요:

> 운영 DB에는 migration 검증 없이 바로 반영하지 않는다.

---

# 8. 첫 users 테이블 생성

첫 실제 DB 테이블로 `users`를 생성했다.

주요 구조:

```text
users

id
email
name
profile_image_url
created_at
updated_at
```

`email`에는 UNIQUE INDEX를 생성했다.

이유:

```text
중복 방지
+
조회 성능
+
D1 row read 감소
```

---

# 9. auth_accounts 설계

Google 로그인만 고려해 `users.google_id`를 넣는 대신,
나중에 Kakao / Apple까지 확장할 수 있도록 별도 테이블로 분리했다.

구조:

```text
users
  ↓
auth_accounts
```

주요 필드:

```text
id
user_id
provider
provider_account_id
created_at
```

주요 인덱스:

```text
(provider, provider_account_id) UNIQUE

user_id INDEX
```

이 구조를 사용하면:

```text
한 사용자
├─ Google
├─ Kakao
└─ Apple
```

처럼 여러 로그인 공급자를 연결할 수 있다.

---

# 10. saju_profiles 설계

사용자가 입력하는 사주 원본 데이터를 저장하는 테이블을 만들었다.

주요 필드:

```text
id
user_id
birth_date
birth_time
gender
calendar_type
is_leap_month
created_at
updated_at
```

`user_id`는 nullable이다.

이유:

```text
회원가입 먼저
→ 사주 입력
```

보다

```text
사주 입력
→ 무료 결과
→ 필요할 때 로그인
```

흐름이 결제 전환에 더 유리할 가능성이 있기 때문이다.

따라서 비회원도 사주 profile을 만들 수 있도록 설계했다.

---

# 11. 첫 실제 기능: 사주 입력 저장

첫 사용자 기능을 구현했다.

흐름:

```text
사용자 입력
↓
POST /api/saju/profile
↓
서버 입력 검증
↓
UUID 생성
↓
D1 INSERT
↓
profileId 반환
↓
/result/{profileId} 이동
```

입력값:

```text
생년월일
태어난 시간
성별
양력/음력
윤달
```

중요한 점:

브라우저의 `required`만 신뢰하지 않고,
API에서도 다시 검증한다.

```text
Client validation
→ UX

Server validation
→ 보안 / 데이터 무결성
```

---

# 12. 저장 후 Redirect 순서 확인

프로필 저장 후 결과 페이지로 이동하는 구조에서
DB 저장과 조회 순서가 뒤집힐 수 있는지 확인했다.

현재 구조:

```ts
await db.insert(...)
```

후:

```ts
return Response.json({ profileId })
```

브라우저는 API 응답을 받은 후:

```ts
window.location.href = `/result/${profileId}`
```

실행.

따라서 순서:

```text
INSERT 완료
↓
API 응답
↓
redirect
↓
SELECT
```

으로 보장된다.

주의:

`await`를 제거하면 race condition 가능성이 생길 수 있다.

---

# 13. 동적 결과 페이지

파일:

```text
src/pages/result/[id].astro
```

Astro의 `[id]`는 Spring의:

```java
/result/{id}
```

와 같은 동적 라우팅 개념이다.

처음에는 다음 에러가 발생했다.

```text
getStaticPaths() function is required for dynamic routes
```

원인:

Astro가 페이지를 정적으로 미리 만들려고 했기 때문.

사주 profile UUID는 런타임에 만들어지므로 결과 페이지는 동적이어야 한다.

해결:

```ts
export const prerender = false
```

이제:

```text
/result/{UUID}
```

요청이 들어오면 Worker가 페이지를 생성한다.

---

# 14. 결과 페이지에서 D1 조회

결과 페이지는 URL의 profile id로 D1을 조회한다.

개념:

```ts
.where(eq(sajuProfiles.id, id))
.limit(1)
```

여기서 `id`는 PRIMARY KEY이므로 조회 효율이 좋다.

```text
full table scan
❌

primary key lookup
✅
```

D1 비용 측면에서도 좋은 패턴이다.

---

# 15. D1 row read 주의사항

개발하면서 가장 중요하게 계속 확인해야 하는 부분 중 하나.

D1은 쿼리 횟수뿐 아니라
**실제로 읽은 row 수가 성능과 비용에 영향을 줄 수 있다.**

예:

```sql
SELECT *
FROM saju_results
WHERE unindexed_column = ?
```

데이터가 100만 건인데 인덱스가 없으면
많은 row를 scan할 수 있다.

앞으로 자주 검색하는 컬럼에는 인덱스를 설계한다.

현재 주요 인덱스:

```text
users.email
→ UNIQUE

auth_accounts(provider, provider_account_id)
→ UNIQUE

auth_accounts.user_id
→ INDEX

saju_profiles.user_id
→ INDEX

saju_profiles.id
→ PRIMARY KEY
```

Drizzle을 사용한다고 DB 설계가 자동으로 좋아지는 것은 아니다.

---

# 16. 사주 계산 엔진 전략

사주 계산을 전부 직접 구현하지 않고
검증된 라이브러리 + 우리 분석 로직 조합으로 결정했다.

선택:

```text
manseryeok
```

구조:

```text
manseryeok
↓
우리 wrapper
↓
calculateSaju()
↓
우리 분석 layer
↓
향후 LLM 해석
```

중요:

외부 라이브러리를 프로젝트 곳곳에서 직접 import하지 않는다.

구조:

```text
src/lib/saju/
├─ engine/
│  └─ manseryeok.ts
├─ calculator.ts
├─ calculator.test.ts
└─ types.ts
```

`engine/manseryeok.ts`만 외부 라이브러리를 직접 알고,
나머지 코드에서는:

```ts
calculateSaju(input)
```

만 사용한다.

장점:

나중에 라이브러리를 교체해도
서비스 전체를 수정할 필요가 줄어든다.

---

# 17. manseryeok 실제 적용

기존 더미 결과:

```text
갑자
을축
병인
정묘
```

를 제거하고 실제 입력값에 따른 사주팔자를 계산하도록 변경했다.

검증 입력:

```text
1991-01-02
13:04
여성
양력
```

결과:

```text
년주 경오
월주 무자
일주 임신
시주 정미
```

실제 사용자 입력 → DB → 계산 엔진 → 결과 페이지 출력까지 연결 완료.

---

# 18. 사주 계산 정책: 자시

사주 계산에서 23시 부근 날짜 변경 정책이 중요하다.

manseryeok가 지원하는 정책:

```text
midnight
jasi
splitJasi
```

테스트:

```text
1991-01-02 23:30
```

결과:

```text
midnight   → 임신
jasi       → 계유
splitJasi  → 임신
```

현재 서비스 기본 정책:

```text
midnight
```

코드에서 명시적으로:

```ts
dayBoundary: input.dayBoundary ?? 'midnight'
```

사용.

외부 라이브러리의 기본값이 바뀌더라도
우리 서비스 정책이 흔들리지 않게 하기 위함이다.

---

# 19. 입춘 경계 테스트

사주에서 연주는 1월 1일이 아니라
입춘 절입 시각을 기준으로 바뀔 수 있다.

1991년 입춘:

```text
1991-02-04 17:08
Asia/Seoul
```

테스트:

```text
17:07
→ 경오

17:09
→ 신미
```

입춘 ±1분 테스트 통과.

이 테스트를 통해 단순 날짜가 아니라
정확한 절입 시각이 반영됨을 확인했다.

---

# 20. 월주 절기 경계 테스트

월주는 음력 월 초하루가 아니라
절기 경계를 기준으로 바뀐다.

1991년 경칩:

```text
1991-03-06 11:12
```

테스트:

```text
11:11
→ 경인

11:13
→ 신묘
```

월주 경계 정상 동작 확인.

주의:

24절기 전부가 월주 변경점은 아니다.

월 경계에 사용되는 12절:

```text
소한
입춘
경칩
청명
입하
망종
소서
입추
백로
한로
입동
대설
```

---

# 21. 양력 / 음력 테스트

동일한 실제 날짜를
양력과 대응 음력으로 입력했을 때
같은 사주팔자가 나오는지 검증했다.

테스트 통과.

이로써 wrapper의 양력/음력 입력 변환이 정상 동작함을 확인했다.

---

# 22. 윤달 테스트

윤달 입력 처리도 테스트했다.

검증 케이스:

```text
음력 2020년 윤4월 1일
=
양력 2020-05-23
```

양쪽 입력 결과가 동일하게 나오는지 확인.

또한:

```text
음력 4월 1일 평달
vs
음력 4월 1일 윤달
```

이 다른 결과를 만드는 것도 확인했다.

실제 테스트 결과:

```text
평달
year 경자
month 경진
day 병신
hour 계사

윤달
year 경자
month 신사
day 병인
hour 계사
```

---

# 23. 출생시간 없음 처리

사용자가 출생시간을 모르는 경우도 지원한다.

정책:

```text
연주
월주
일주
→ 계산

시주
→ null
```

내부 라이브러리 계산을 위해 임시 시간값을 사용할 수 있지만
우리 결과 타입에서는 시주를 사용하지 않는다.

향후 대운 등에서 출생시간 미상 정책을 다시 검토할 수 있다.

---

# 24. 진태양시 테스트

출생지역에 따라 실제 태양시를 보정하는 기능도 테스트했다.

테스트 예:

```text
1990-05-15 07:05
서울
```

일반 계산:

```text
day 경진
hour 경진
```

진태양시 적용:

```text
day 경진
hour 기묘
```

즉 시주가 달라질 수 있음을 확인했다.

현재 MVP 정책:

```text
진태양시 OFF
```

이유:

현재 입력폼에서 출생지역을 받지 않기 때문.

향후:

```text
출생지역
→ longitude
→ 진태양시 계산
```

형태로 확장 가능.

---

# 25. 테스트 환경 구축

Vitest 사용.

package script:

```bash
npm run test:run
```

의미:

프로젝트 내부의:

```text
*.test.ts
*.spec.ts
```

등을 Vitest가 자동으로 찾아 전체 실행한다.

특정 파일만 실행할 수도 있다.

현재 Codex 작업 후:

```text
22 tests passing
```

상태.

추가로:

```text
npm run check
npm run typecheck
npm run build
```

환경도 정리했다.

현재 검증 상태:

```text
전체 타입 검사
→ 오류 0
→ 경고 0

테스트
→ 22개 통과

production build
→ 성공
```

---

# 26. Phase A 완료: 실제 사주 데이터 확장

Codex를 통해 Phase A를 진행했다.

추가된 내용:

```text
기둥별 원시 오행
기둥별 십성
```

결과 화면에도:

```text
오행
십성
계산 기준 안내
```

가 추가되었다.

출생시간이 없을 경우:

```text
시주 오행 제외
시주 십성 제외
```

처리.

중요한 방향:

> 아직 오행 강도 / 퍼센트 / 신강신약 같은 해석은 하지 않는다.

원시 데이터와 해석 데이터를 분리한다.

---

# 27. /api/users 보안 문제 발견 및 제거

개발용 `/api/users` API가 인증 없이
사용자 이메일/이름을 반환할 수 있는 문제가 발견되었다.

공개 전 제거하기로 결정했고
Codex가 endpoint를 삭제했다.

현재 상태:

```text
코드에서 제거 완료
빌드 산출물에서도 제거 확인
```

단:

> 아직 재배포 전이면 기존 운영 Worker에는 남아 있을 수 있다.

배포 후 반드시 운영 URL에서 404인지 확인해야 한다.

---

# 28. npm audit / sharp 이슈

현재 npm audit에서:

```text
sharp 관련 high severity 5건
```

이 보고되었다.

Cloudflare 도구 의존성 경로에서 발생한 것으로 보인다.

현재 정책:

```text
npm audit fix --force
```

를 바로 실행하지 않는다.

이유:

강제 버전 변경이 Astro / Wrangler / Cloudflare toolchain 호환성을 깨뜨릴 수 있기 때문.

먼저 확인할 것:

```text
production dependency인가?
dev dependency인가?
실제 runtime reachable한가?
안전하게 올릴 수 있는 버전이 있는가?
```

---

# 29. 현재 프로젝트 구조 개념

현재 핵심 구조:

```text
src/
├─ db/
│  ├─ schema.ts
│  └─ client.ts
│
├─ lib/
│  └─ saju/
│     ├─ engine/
│     │  └─ manseryeok.ts
│     ├─ calculator.ts
│     ├─ calculator.test.ts
│     └─ types.ts
│
├─ pages/
│  ├─ index.astro
│  ├─ result/
│  │  └─ [id].astro
│  └─ api/
│     └─ saju/
│        └─ profile.ts
│
drizzle/
drizzle.config.ts
wrangler.jsonc
AGENTS.md
```

---

# 30. 현재까지 완성된 전체 사용자 흐름

```text
사용자
↓
Astro 페이지
↓
사주 정보 입력
↓
POST /api/saju/profile
↓
서버 검증
↓
D1 저장
↓
profileId 생성
↓
/result/{id}
↓
D1 조회
↓
calculateSaju()
↓
manseryeok
↓
우리 wrapper
↓
연주 / 월주 / 일주 / 시주
↓
원시 오행 / 십성
↓
결과 화면
```

---

# 31. 앞으로 가장 먼저 할 일

Phase A 다음은 Phase B다.

하지만 고급 해석으로 바로 가지 않는다.

다음 후보:

```text
표면 8글자 기준 오행 단순 집계
↓
지장간
↓
오행 분석
↓
십성 분석
↓
신강 / 신약
↓
용신 등 고급 분석
```

첫 분석 기능은:

```text
표면 오행 분포
```

추천.

예:

```text
목 0
화 2
토 2
금 2
수 2
```

주의:

이 값을 바로:

```text
목 0%
화 25%
```

같은 "오행 강도"라고 부르면 안 된다.

왜냐하면 실제 강도 분석은:

```text
월령
지장간
계절 영향
통근
투간
생극
```

등을 고려할 수 있기 때문이다.

따라서:

```text
표면 글자 단순 집계
```

와:

```text
오행 강도 분석
```

은 별도 개념으로 유지한다.

---

# 32. 비용 / 성능 / 보안 체크리스트

## D1

항상 확인:

```text
WHERE 컬럼에 INDEX 있는가?
SELECT 범위가 너무 넓지 않은가?
LIMIT 없는 전체 조회가 있는가?
불필요한 write가 반복되지 않는가?
```

## 공개 POST API

운영 전 추가 예정:

```text
Rate Limit
Turnstile
서버 validation
```

## LLM

가장 큰 비용 위험 후보.

반드시:

```text
결제 확인
↓
기존 생성 결과 확인
↓
Rate Limit
↓
idempotency 확인
↓
LLM 호출
```

순서로 설계.

## 결제

Toss Payments 추가 시:

```text
Browser 결제 성공
≠
실제 결제 검증 완료
```

Worker에서 반드시 Toss API로 확인해야 한다.

또:

```text
order_id UNIQUE
payment_key UNIQUE
```

등 중복 방어 필요.

## 결과 페이지

현재 무료 UUID 결과는 초기 MVP에서는 허용.

하지만:

```text
유료 결과
개인 결과
결제 내역
```

에서는 UUID만으로 접근권한을 판단하면 안 된다.

---

# 33. 개발 원칙

앞으로도 다음 원칙을 유지한다.

```text
1. 원시 데이터와 해석을 분리
2. 외부 라이브러리와 서비스 코드를 wrapper로 분리
3. DB 변경은 migration으로 관리
4. 로컬 검증 후 운영 반영
5. 비용 위험 지점은 구현 시 항상 체크
6. 개인정보 최소 수집
7. MVP 단계에서는 과도한 인프라 도입 금지
8. 계산 정책 변경 시 회귀 테스트 추가
```

---

# 34. 현재 상태 요약

현재까지 프로젝트는 단순 Hello World를 넘어
실제 사주 서비스의 핵심 기반이 만들어진 상태다.

완료된 영역:

```text
Astro / Cloudflare 배포
D1
Drizzle
Migration
회원 기반 스키마
비회원 사주 profile
입력 / 저장 / 조회
동적 결과 페이지
manseryeok 계산 엔진
양력 / 음력
윤달
입춘
절기
자시
진태양시 테스트
오행 / 십성 raw data
Vitest
Type Check
Production Build
Codex AGENTS.md
```

아직 미구현:

```text
실제 사주 분석 layer
Google 로그인
Toss 결제
LLM 해석
R2
Rate Limit
Turnstile
유료 결과 권한 처리
운영용 UI / 디자인
```

---

# 35. 복기할 때 보는 추천 순서

나중에 이 프로젝트를 다시 볼 때는 아래 순서로 읽으면 된다.

```text
1. 프로젝트 목표
2. 기술 스택
3. D1 / Drizzle 구조
4. 사주 입력 저장 흐름
5. 결과 페이지
6. manseryeok wrapper
7. 테스트 정책
8. 입춘 / 절기 / 자시 / 윤달 / 진태양시
9. Phase A 오행 / 십성
10. 비용 / 보안 체크리스트
11. 앞으로 할 일
```

---

# 36. Phase B 첫 작업: 표면 오행 단순 집계

`src/lib/saju/analyzer/elements.ts`에 `countSurfaceElements()`를 추가했다.
Phase A의 `SajuResult.elements`를 받아 년주·월주·일주·시주의 천간과 지지를
각각 1개씩 집계하고, 목/화/토/금/수의 정수 count만 반환한다.
기존 manseryeok wrapper와 계산 정책은 유지했다.

- 출생시간 있음: 총 8글자.
- 출생시간 없음: `hour: null`을 제외해 총 6글자.
- 대표 사례 1991-01-02 13:04 여성 양력(경오·무자·임신·정미): 목 0, 화 2, 토 2, 금 2, 수 2.
- 같은 날짜의 출생시간 미상: 목 0, 화 1, 토 1, 금 2, 수 2.

결과 화면에는 "표면 오행 분포" 표와 집계 대상 8글자/6글자 안내를 추가했다.
실제 오행의 세기나 강도를 의미하지 않는다는 문구도 표시한다.
퍼센트, 가중치, 지장간, 신강/신약 및 해석은 추가하지 않았다.

단위 테스트 11개를 추가했다. 대표 사례, 시간 누락 3가지(null/undefined/빈 문자열),
총합 8/6, 동일 오행 중복 집계, 모든 기둥의 집계, 입력 불변성과 호출 간 독립성을 검증한다.

검증 결과:

| 명령 | 결과 |
| --- | --- |
| `npm run check` | 오류 0, 경고 0 |
| `npm run typecheck` | 오류 0, 경고 0 |
| `npm run test:run` | 2개 파일, 33개 통과(기존 22개 + 신규 11개) |
| `npm run build` | production build 성공 |

비용·성능·보안: 요청당 최대 8글자만 집계하는 순수 함수이며 추가 DB 조회/쓰기,
외부 API 호출, 개인정보 수집이 없다. DB schema, migration, 결제 코드는 변경하지 않았다.
기존 sharp 보안 메모는 그대로 적용되며 이미지 처리 기능을 추가하지 않았다.

기존 루트 개발 기록을 요청된 `docs/SAJU_DEVELOPMENT_LOG.md`로 이동했다.
앞선 단계들은 당시 기록이며, 최신 진행 상태는 이 36번 항목을 기준으로 한다.

---

## 마지막 업데이트 기준

Phase A와 Phase B 첫 작업(표면 오행 단순 집계)을 완료했다.
다음 분석 작업은 지장간 등 후보의 범위와 방법론을 먼저 합의한 뒤 진행한다.
가중치·강도 해석과 계산 결과 DB 저장은 아직 구현하지 않았다.
