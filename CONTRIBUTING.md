# glo 기여 가이드

이 문서는 **개발자가 아닌 팀원**(마케팅 · 디자인)도 사이트에 직접 기여할 수 있도록 만든 가이드입니다.

---

## 0. 한 번만 셋업

### 필요한 도구

| 도구 | 용도 | 다운로드 |
|---|---|---|
| **GitHub 계정** | 코드 저장소 접근 | https://github.com/signup |
| **GitHub Desktop** (선택) | 비개발자용 Git GUI | https://desktop.github.com |
| **VS Code** (선택) | 텍스트 에디터 | https://code.visualstudio.com |

> 💡 **가장 가벼운 옵션:** GitHub Desktop 없이 **GitHub.com 웹 편집기**만 써도 충분합니다. 카피 한두 줄 바꾸기엔 이게 가장 빠릅니다.

### 저장소 접근 권한

`shinwook-k`에게 GitHub username을 알려주고 collaborator로 추가받으세요.

---

## 1. 큰 그림 — 파일 어디에 뭐가 있나

```
glo/
├── index.html              ← 영어 랜딩 (US 시장)
├── product.html            ← 영어 GL-01 상품 페이지
├── science.html            ← 영어 사이언스
├── about.html              ← 영어 About
├── privacy.html, terms.html, refund.html  ← 영어 법적 페이지
│
├── ko/                     ← 한국 시장 (모든 한국어 페이지)
│   ├── index.html          ← 메인 랜딩
│   ├── product.html        ← GL-01 상품 상세
│   ├── science.html        ← 사이언스
│   ├── about.html          ← 공동 개발 연구진
│   ├── login.html          ← 카카오 로그인
│   ├── account.html        ← 마이페이지
│   ├── privacy.html        ← 개인정보처리방침
│   └── terms.html          ← 이용약관
│
├── assets/
│   ├── js/glo-auth.js      ← 카카오 로그인 + 얼리버드 (개발자 영역)
│   ├── bottle/             ← 사쉐 이미지
│   ├── founders/           ← MD 사진
│   ├── og/                 ← SNS 미리보기 이미지
│   └── video/              ← 히어로 영상
│
├── _styleguide.html        ← 디자인 토큰 + 컴포넌트 참고용
├── CONTRIBUTING.md         ← 이 문서
└── README.md
```

**핵심:** 한국 사이트는 모두 `ko/` 폴더 안에 있고, 영어 사이트는 루트(`/`)에 있습니다.

---

## 2. 변경 유형별 가이드

### 🅰 카피 한 줄 바꾸기 (마케팅)

**예시 시나리오:** `ko/index.html`의 hero 문구 "4 x 9 Protocol" → "4 × 9 Skin Protocol"로 바꾸고 싶음.

**브라우저만으로 (가장 쉬움):**

1. https://github.com/weglow-glo/glo-us 접속
2. `ko/` 폴더 → `index.html` 클릭
3. 우상단 **연필(✏️) 아이콘** 클릭 → 편집 모드
4. `Ctrl+F`로 바꿀 문구 검색 → 수정
5. 페이지 맨 아래로 스크롤:
   - **Commit message** (제목): `mkt: hero 문구 수정 — 4x9 Protocol`
   - **"Create a new branch and start a pull request"** 선택
   - 브랜치명: `mkt/hero-copy-fix` 같은 형식
6. **"Propose changes"** 클릭 → PR 자동 생성
7. PR 페이지에서 잠시 후 Cloudflare가 **Preview 링크** 댓글 자동 추가 — 그 URL로 미리보기 확인
8. Slack 등에 PR URL 공유 → 리뷰 받음 → 머지

**미리보기 URL 예시:**
- 브랜치: `mkt/hero-copy-fix`
- Preview: `https://mkt-hero-copy-fix.glo-us.pages.dev`
- 1분 내 자동 빌드되어 접근 가능

### 🅱 디자인 토큰 변경 (디자인)

**예시:** burgundy 메인 컬러 `#8a4a52` → `#9a4f5a`로 살짝 밝게.

⚠️ 디자인 토큰은 **모든 8개 한국 페이지 + 7개 영어 페이지 + assets/js/glo-auth.js**에 중복 정의되어 있습니다. (Next.js 마이그레이션 전까지 어쩔 수 없음)

**일관성 유지 위해:**
- 개발자에게 요청 — 일괄 치환 스크립트로 처리
- 또는 본인이 모든 파일에서 `#8a4a52`를 `#9a4f5a`로 치환 (GitHub 검색 → 모든 파일에서 Find & Replace)

**참고:** `_styleguide.html`에서 토큰 + 컴포넌트 라이브 프리뷰 확인 가능.

### ©️ 새 컴포넌트 / 큰 UI 변경 (디자인 ↔ 개발자)

1. 디자인이 Figma에서 시안 작성
2. PR 또는 Issue로 시안 첨부 + 어느 페이지에 들어갈지 명시
3. 개발자가 구현 (디자인 토큰 활용)
4. PR Preview로 디자인 검수 → 머지

---

## 3. 브랜치 네이밍 규칙

| Prefix | 용도 | 예시 |
|---|---|---|
| `mkt/` | 카피·콘텐츠 수정 | `mkt/hero-copy-v3`, `mkt/faq-update` |
| `design/` | 시각적 변경 (색·여백·타이포) | `design/footer-redesign` |
| `feat/` | 새 기능 (개발자) | `feat/checkout-flow` |
| `fix/` | 버그 수정 | `fix/mobile-nav-overflow` |
| `docs/` | 문서만 수정 | `docs/contributing-update` |

---

## 4. 커밋 메시지 규칙

**형식:** `[prefix]: 짧은 설명`

✅ 좋은 예:
- `mkt: 히어로 문구 — "Reverse your skin age" 강조`
- `design: 푸터 배경 burg-800 → burg-900`
- `fix: 모바일에서 atom 위치 사쉐 뒤로 가는 버그`

❌ 나쁜 예:
- `수정함`
- `update`
- `asdf`

---

## 5. PR 리뷰 + 머지

- 모든 PR은 **최소 1명의 리뷰** 필요
- Preview URL 확인 후 리뷰
- 머지는 PR 작성자가 직접 (리뷰 승인 후)
- `main` 브랜치는 머지 직후 자동으로 https://glo-us.com 에 배포 (Cloudflare Pages)

---

## 6. 자주 하는 작업 — 빠른 레퍼런스

### 헤더 메뉴 추가/수정

- 모든 KR 페이지의 `<nav>` 블록 (8개 파일)
- 모든 EN 페이지의 `<nav>` 블록 (5개 파일)
- ⚠️ **개발자에게 요청 권장** — 일괄 동기화 필요

### 푸터 텍스트 수정

- `<footer>` 안의 `foot-tag`, `foot-legal`, `foot-biz` 등
- 사업자정보 변경 시: `(주)위글로우 · 대표 · 등록번호 · 주소 · 전화` 라인
- ⚠️ 모든 페이지에 중복 → 개발자에게 요청

### 한 페이지의 이미지 교체

1. 새 이미지를 `assets/` 폴더에 업로드 (적절한 하위 폴더 선택)
2. 해당 HTML 파일에서 `src="..."` 부분의 경로만 교체
3. PR

### 새 페이지 추가

⚠️ 개발자 영역. 라우팅·SEO·다국어·sitemap 등 신경 쓸 게 많음.

---

## 7. 디자인 토큰 (핵심만)

전체 토큰 + 컴포넌트는 https://glo-us.com/_styleguide.html 에서 확인.

**브랜드 컬러:**
- `--accent` `#8a4a52` — 메인 브랜드 burgundy (이탤릭·강조)
- `--burg-600` `#3a1a22` — 다크 burgundy (버튼·임팩트 섹션)
- `--burg-800` `#2a1218` — 가장 어두운 burgundy (푸터)
- `--ink` `#2a1218` — 본문 텍스트
- `--cream` `#f4ebeb` — 어두운 배경 위 텍스트
- `--bg-3` `#f3eaea` — rose-tint 패널

**폰트:**
- **Fraunces** (serif) — 헤드라인 · 이탤릭 강조
- **Inter** (sans) — 본문 · 버튼 (영어)
- **Pretendard** (sans) — 본문 (한국어)
- **Noto Serif KR** (serif) — 헤드라인 (한국어, Fraunces 폴백)

**버튼 클래스:**
- `.btn-p` — 메인 CTA (burgundy 배경 + cream 텍스트)
- `.btn-g` — 보조 CTA (텍스트 only + 밑줄)
- `.btn-nav` — 헤더 우측 버튼
- `.kakao-btn` — 카카오 노란색 버튼 (로그인 페이지)
- `.final-btn` — 최종 CTA 섹션 메인 버튼

---

## 8. 막힐 때

| 상황 | 어떻게 |
|---|---|
| Git/GitHub UI 헷갈림 | 개발자에게 화면 캡처 + 무엇을 바꾸려는지 설명 |
| PR이 빨갛게 (CI 실패) | 개발자 호출 — HTML 구조 깨졌을 가능성 |
| Preview URL이 안 떠 | 1~2분 더 기다리기, 그래도 안 뜨면 개발자 |
| 토큰·컴포넌트 어디 있는지 모름 | `_styleguide.html` 확인 |
| 이게 컴포넌트인지 카피인지 헷갈림 | 일단 PR 만들고 댓글로 질문 |

---

## 9. 절대 하면 안 되는 것

- ❌ `main` 브랜치에 직접 커밋 (PR로만)
- ❌ 카카오/Supabase API 키 같은 secret를 코드에 노출 (public key 외)
- ❌ `archive/` 폴더 안 파일 수정 (옛 프로젝트, 배포 안 됨)
- ❌ `CLAUDE.md` 수정 (이건 개발자용 메모)
- ❌ 비밀번호·이메일·전화번호 같은 실제 개인정보를 더미 데이터로 넣기 (마스킹된 placeholder만)

---

## 10. 추가 자료

- [README.md](./README.md) — 프로젝트 개요
- [`_styleguide.html`](./\_styleguide.html) — 디자인 시스템 라이브 프리뷰
- [GitHub.com 웹 편집기 사용법](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files) (영문)
- [Cloudflare Pages Preview](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) (영문)

---

질문은 GitHub Issues 또는 직접 개발자에게 연락하세요.
