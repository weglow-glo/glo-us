# glo — 배포 (Vercel)

Next.js 앱(`web/`)은 **Vercel**에 배포한다. 정적 사이트와 달리 서버 기능(토스 결제 승인, Supabase 인증/SSR)이 있어 정적 호스팅으로는 불가.

## Vercel 프로젝트 설정 (대시보드)

- **Root Directory:** `web`  ← 모노레포 형태이므로 반드시 지정
- **Framework Preset:** Next.js (자동 감지)
- **Build Command:** 기본값 (`next build`). `prebuild` 훅이 `copy-assets.mjs`를 돌려 repo 루트 `assets/`를 `web/public/assets/`로 복사한다.
- **Install Command:** 기본값 (`npm install`)
- **Node:** 기본값(20+). 로컬은 24.

## 환경변수 (Vercel → Settings → Environment Variables, Production + Preview 모두)

| 키 | 비고 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용 · 비밀** |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | 공개(위젯용) |
| `TOSS_SECRET_KEY` | **서버 전용 · 비밀** |
| `ADMIN_PASSWORD` | **서버 전용 · 비밀** — /admin Basic Auth 비밀번호 (강한 값으로) |

> **관리자 페이지:** `https://<도메인>/admin` 접속 시 브라우저 Basic Auth 창이 뜸. 아이디는 아무거나, 비밀번호는 `ADMIN_PASSWORD` 값. 주문 목록·상세·배송처리(송장)·CSV 내보내기 제공.

> **DB 마이그레이션:** Supabase SQL Editor에서 `web/supabase/migrations/`의 `0001_init.sql`, **`0002_fulfillment.sql`**(배송/송장 컬럼)을 순서대로 실행. 0002 미적용 시 /admin 주문목록이 `tracking_number does not exist` 에러.

값은 로컬 `web/.env.local` 참고 (이 파일은 커밋 금지). 이메일(Resend)은 비활성화 — `RESEND_API_KEY` 미설정 시 발송 자동 skip.

## DNS / 도메인

- 도메인(`glo-us.com`)은 Cloudflare에 그대로 둔다. Vercel에서 도메인 추가 후 Cloudflare에 Vercel이 안내하는 레코드(CNAME/A) 등록.
- **주의:** 현재 `glo-us.com`은 정적 사이트(main → Cloudflare)로 서비스 중. Next 앱으로의 전환(cutover)은 별도 의사결정 — 준비되면 도메인을 Vercel로 가리키게 변경.

## 자산 파이프라인

- 단일 소스 = repo 루트 `assets/`. `web/public/assets/`는 **생성물**(gitignore). `predev`/`prebuild`가 `web/scripts/copy-assets.mjs`로 동기화(`-orig.mp4` 백업 제외).
- 마케팅 페이지는 `ko/*.html`에서 `web/scripts/port-marketing.mjs`로 생성. `ko/` 수정 후 `npm run port-marketing` 재실행.

## 프로덕션 전 체크리스트

- [ ] **Supabase Auth → URL Configuration → Redirect URLs**에 프로덕션 도메인(`https://glo-us.com/**` 또는 Vercel 도메인) + 로컬(`http://localhost:3000/**`) 추가 — 카카오 OAuth 콜백(`/auth/callback`)용.
- [ ] **토스 키 LIVE 전환** — 현재 TEST 키. 실판매 시 라이브 클라이언트/시크릿 키로 교체.
- [ ] **법률 페이지** privacy/terms/refund — DRAFT, 법무 검토 필요. 본문에 옛 사업자명("위글로우") 잔존 → 메디랩스로 수정.
- [ ] **사업자 정보** 푸터 — 메디랩스/대표/사업자번호/통신판매업번호는 반영됨. 주소·전화·개인정보책임자는 메디랩스 기준 확인 필요.
- [ ] **OG 이미지** — 현재 `assets/og/og-cover.svg`. SVG는 SNS 미리보기에서 안 뜨므로 PNG(1200×630)로 교체 + 메타 갱신.
- [ ] **favicon** — `/favicon.svg`가 `web/public`에 없을 수 있음. 필요 시 `web/public/favicon.svg` 추가 또는 `app/icon`.
- [ ] **가격 전환 (수동)** — 7월 2일 정식 출시 시 `web/src/lib/product.ts`의 `price`를 119000으로, 사전할인 배지/문구 제거 (또는 사전결제 안내 정리).
