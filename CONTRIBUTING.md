# glo 기여 가이드

이 문서는 **개발자가 아닌 팀원**(마케팅 · 디자인)도 사이트에 기여할 수 있도록 만든 가이드입니다.

> 사이트는 `web/` 폴더의 **Next.js 앱**(Vercel 배포)입니다. 마케팅 페이지(랜딩·상품·사이언스·어바웃·법적)는 **`ko/*.html` 소스**를 편집한 뒤 생성 스크립트로 만들어집니다.

---

## 0. 한 번만 셋업

### 필요한 도구

| 도구 | 용도 | 다운로드 |
|---|---|---|
| **GitHub 계정** | 코드 저장소 접근 | https://github.com/signup |
| **GitHub Desktop** (선택) | 비개발자용 Git GUI | https://desktop.github.com |
| **VS Code** (선택) | 텍스트 에디터 | https://code.visualstudio.com |
| **Node.js** (개발자만) | 로컬 미리보기·빌드 | https://nodejs.org |

> 💡 카피 한두 줄만 바꾼다면 **GitHub.com 웹 편집기**로 `ko/*.html`만 고치면 됩니다. 머지하면 **빌드가 알아서 페이지를 다시 만들어 배포**해요 (수동 재생성·개발자 호출 불필요).

### 저장소 접근 권한

`shinwook-k`에게 GitHub username을 알려주고 collaborator로 추가받으세요.

---

## 1. 큰 그림 — 파일 어디에 뭐가 있나

```
glo/
├── web/                    ← 실제 사이트 (Next.js · Vercel) — 개발자 영역
│   ├── src/app/(marketing)/   ← 마케팅 페이지 (ko/에서 자동 생성, 직접 편집 ❌)
│   ├── src/app/checkout · account · login · admin/   ← 커머스
│   └── scripts/port-marketing.mjs   ← ko/ → 마케팅 페이지 생성기
│
├── ko/                     ← 마케팅 소스 (여기를 편집!)
│   ├── index.html          ← 메인 랜딩
│   ├── product.html        ← GL-01 상품 상세
│   ├── science.html        ← 사이언스
│   ├── about.html          ← 공동 개발 연구진
│   ├── privacy.html        ← 개인정보처리방침
│   ├── terms.html          ← 이용약관
│   └── refund.html         ← 환불·교환 정책
│
├── assets/                 ← 공용 미디어 (bottle/ founders/ og/ video/ images/)
├── CONTRIBUTING.md         ← 이 문서
└── README.md
```

**핵심:** 마케팅 카피·디자인은 **`ko/*.html`** 에서 고칩니다. 로그인·결제·마이페이지·관리자는 `web/`의 개발자 영역입니다.

---

## 2. 변경 유형별 가이드

### 🅰 카피 한 줄 바꾸기 (마케팅)

**예시:** `ko/index.html`의 hero 문구를 바꾸고 싶음.

1. https://github.com/weglow-glo/glo-us 접속 → `ko/` → `index.html`
2. 우상단 **연필(✏️)** 클릭 → `Ctrl+F`로 문구 검색 → 수정
3. 맨 아래 **Commit message**(`mkt: hero 문구 수정`) → **"Create a new branch and start a pull request"** → 브랜치명 `mkt/hero-copy-fix`
4. **"Propose changes"** → PR 생성
5. Vercel이 PR에 **Preview 링크**를 자동으로 답니다 (빌드가 `ko/`에서 페이지를 자동 재생성) — 그 URL로 미리보기 확인 → 리뷰 → 머지 → 배포. **수동 재생성 불필요.**

### 🅱 디자인 토큰 변경 (디자인)

디자인 토큰은 각 `ko/*.html`의 `:root`와 `web/`의 `globals.css`에 정의돼 있습니다. 일괄 변경은 **개발자에게 요청**하세요(여러 파일 동기화 필요).

### ©️ 새 컴포넌트 / 큰 UI 변경 (디자인 ↔ 개발자)

1. 디자인이 Figma 시안 작성 → PR/Issue로 첨부 + 들어갈 페이지 명시
2. 개발자가 구현 → PR Preview로 검수 → 머지

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

✅ `mkt: 히어로 문구 강조` · `design: 푸터 배경 burg-800 → burg-900` · `fix: 모바일 atom 위치 버그`
❌ `수정함` · `update` · `asdf`

---

## 5. PR 리뷰 + 머지

- 모든 PR은 **최소 1명의 리뷰** 필요 + CI 통과
- Vercel Preview URL 확인 후 리뷰
- `main` 브랜치는 머지 직후 자동으로 **Vercel에 배포** (https://glo-us.com)
- `main` 직접 푸시는 막혀 있습니다 (PR로만)

---

## 6. 자주 하는 작업 — 빠른 레퍼런스

### 헤더/푸터 텍스트 수정
- nav·footer는 **공용 chrome**(`ko/index.html`에서 생성)입니다. 사업자정보 등은 `ko/index.html`의 `<footer>`를 고치면 빌드 때 전 페이지에 자동 반영됩니다.

### 이미지 교체
1. 새 이미지를 `assets/`의 알맞은 하위 폴더에 업로드
2. 해당 `ko/*.html`에서 경로(`src="..."` / `url(...)`)만 교체 (빌드가 자동 반영)

### 새 페이지 추가
⚠️ 개발자 영역 (라우팅·SEO·생성기 등록 필요).

---

## 7. 디자인 토큰 (핵심만)

**브랜드 컬러:**
- `--accent` `#8a4a52` — 메인 브랜드 burgundy (이탤릭·강조)
- `--burg-600` `#3a1a22` — 다크 burgundy (버튼·임팩트 섹션)
- `--burg-800` `#2a1218` — 가장 어두운 burgundy (푸터)
- `--ink` `#2a1218` — 본문 텍스트 · `--cream` `#f4ebeb` — 어두운 배경 위 텍스트
- `--bg-3` `#f3eaea` — rose-tint 패널

**폰트:**
- **Wanted Sans** — 한글·영문 본문 기본
- **Times New Roman** — 포인트(색 들어간) 영문
- **Fraunces** — 로고 `glo` + 본문 속 brand 단어 "glo"

---

## 8. 막힐 때

| 상황 | 어떻게 |
|---|---|
| Git/GitHub UI 헷갈림 | 개발자에게 화면 캡처 + 무엇을 바꾸려는지 설명 |
| PR이 빨갛게 (CI 실패) | 개발자 호출 — HTML 구조나 빌드 깨졌을 가능성 |
| `ko/` 고쳤는데 미리보기에 반영 안 됨 | 빌드(Vercel Preview) 완료를 1~2분 기다리기 |
| Preview URL이 안 떠 | 1~2분 더 기다리기, 그래도 안 뜨면 개발자 |

---

## 9. 절대 하면 안 되는 것

- ❌ `main` 브랜치에 직접 커밋 (PR로만)
- ❌ `web/src/app/(marketing)/`의 생성된 파일 직접 수정 (빌드 산출물 — git에 없음, 덮어써짐. `ko/`를 고칠 것)
- ❌ API secret를 코드에 노출 (`web/.env.local`에만, public key 외)
- ❌ `archive/` 폴더 수정 (옛 프로젝트, 배포 안 됨)
- ❌ `CLAUDE.md` 수정 (개발자용 메모)
- ❌ 실제 개인정보를 더미 데이터로 (마스킹된 placeholder만)

---

## 10. 추가 자료

- [README.md](./README.md) — 프로젝트 개요 · 스택 · 구조
- [GitHub.com 웹 편집기 사용법](https://docs.github.com/en/repositories/working-with-files/managing-files/editing-files)

---

질문은 GitHub Issues 또는 직접 개발자에게 연락하세요.
