# glo

**Skin longevity protocol — a daily ingestible supplement.**
8 specialists, 4 years of formulation, 9 clinically-studied actives (incl. glo-patented Tightening-PB Complex®).

🌐 **Live:** https://glo-us.com · https://glo-us.com/ko/
📦 **SKU:** GL-01 · 15 ml pineapple liquid shot · 30-pack monthly

---

## What this repo is

The marketing + signup website for **glo health, inc.** (operated in Korea by **(주)위글로우**). Static HTML/CSS pages with a small JS layer for Kakao Login + early-bird signup. Deployed via Cloudflare Pages.

This is currently a **pre-launch site**. Real ecommerce / checkout flow is planned post Kakao Sync approval + Stripe integration (see roadmap below).

---

## Tech stack

| Layer | Tool | Status |
|---|---|---|
| Hosting | Cloudflare Pages | ✅ Live |
| DNS | Cloudflare | ✅ |
| Auth | Supabase (PostgreSQL + Auth) | ✅ Live |
| Social login | Kakao OAuth + Kakao Sync | ✅ Live |
| Email / Marketing | Klaviyo | ⏸️ Paused (Kakao 채널 우선) |
| Payments | Stripe | ⬜ Planned (post-launch) |
| Channel messaging | Kakao for Business 채널톡 | ⏸️ For launch broadcast |

**No build step (yet).** Each HTML page is self-contained (inline `<style>` + inline `<script>`). A Next.js + Tailwind + TypeScript migration is on the roadmap once copy/UX is locked across all pages.

---

## Repo structure

```
.
├── index.html, product.html, science.html, about.html    ← EN pages
├── privacy.html, terms.html, refund.html                  ← EN legal
│
├── ko/                                                    ← Korean pages
│   ├── index.html, product.html, science.html, about.html
│   ├── login.html, account.html                           ← Kakao auth flow
│   └── privacy.html, terms.html                           ← KR legal
│
├── assets/
│   ├── js/glo-auth.js                                     ← Supabase + Kakao + 얼리버드 modal
│   ├── bottle/, founders/, og/, video/, ingredients/      ← Static assets
│   └── css/brand.css                                      ← Reference-only design tokens
│
├── _styleguide.html                                       ← Internal design system reference
├── sitemap.xml, robots.txt, favicon.svg
│
├── CONTRIBUTING.md                                        ← Non-dev contributor guide
├── .github/                                               ← PR + Issue templates
└── README.md                                              ← This file
```

---

## Live URLs

### Pages
- **KR home:** https://glo-us.com/ko/
- **EN home:** https://glo-us.com/ (auto-redirects to /ko/ for Korean browsers)
- **Style guide (internal):** https://glo-us.com/_styleguide.html

### Pre-launch sign-in
- **Login:** https://glo-us.com/ko/login.html (카카오 OAuth)
- **My page:** https://glo-us.com/ko/account.html

---

## Local preview

No build needed. Just open any `.html` file in a browser.

```bash
# Optional: a tiny dev server if you want clean URLs
python -m http.server 8080
# → http://localhost:8080/ko/
```

Or use VS Code's **Live Server** extension.

---

## Contributing

**Non-developer contributors (marketing · design)** → start here: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

Quick version:
1. Edit files directly in **GitHub web UI** (✏️ pencil icon)
2. Create a new branch (`mkt/...`, `design/...`, `feat/...`, `fix/...`)
3. Open a Pull Request
4. Cloudflare Pages will auto-deploy a preview URL within 1–2 min
5. Get 1 reviewer approval → merge → live

**Branch protection:** `main` requires PR + 1 review + passing CI. Direct pushes to `main` are blocked.

**Design system:** See [`_styleguide.html`](./\_styleguide.html) — colour tokens, typography, components, all in one place.

---

## Roadmap

### Phase 1 — Pre-launch (current)
- ✅ Site copy locked (KR + EN)
- ✅ Kakao Login + 카카오 Sync integration
- ✅ Early-bird signup flow (Supabase-backed)
- ✅ Team collab workflow (CONTRIBUTING.md, PR templates, style guide)
- ⏳ 카카오 채널 friend acquisition (via Sync default-check)
- ⏳ Decap CMS for marketing self-service

### Phase 2 — Launch
- ⬜ Stripe checkout integration
- ⬜ Subscription management (정기구독)
- ⬜ Kakao 채널톡 launch broadcast (50% 얼리버드 discount)
- ⬜ Order tracking + shipping notifications

### Phase 3 — Scale
- ⬜ Next.js + Tailwind migration (component library, design tokens single-source)
- ⬜ Member dashboard expansion (order history, refer-a-friend, etc.)
- ⬜ Admin dashboard (manual operations → automated)

See [`CLAUDE.md`](./CLAUDE.md) for the detailed engineering brief (private — not in this public repo).

---

## Legal · brand notes

- **glo** is a registered brand of **glo health, inc.** (operated in Korea by **(주)위글로우**).
- **Tightening-PB Complex®** is a proprietary formulation registered under **KR Patent No. 10-2911449**.
- **SEPRECAM®** is a registered trademark of Triple Treasure Health Foods Ltd.
- glo is a daily ingestible food product. Statements on this site have not been evaluated by the FDA / 식약처 and are not intended to diagnose, treat, cure, or prevent any disease.

**Business info (Korea — 전자상거래법):**
(주)위글로우 · 대표 강신욱 · 사업자등록번호 517-86-00666 · 통신판매업신고 제 2022-서울강남-00726호 · 서울시 성동구 왕십리로 38, 3층 · 고객센터 02-467-1024

---

## License

© 2026 **glo health, inc.** / **(주)위글로우**. All rights reserved.

The source code in this repository is published for transparency and team collaboration. **Brand, copy, design, photography, and product information are proprietary** and may not be reused without permission. Forking the technical scaffolding for non-commercial learning purposes is fine — please don't impersonate the brand.

---

## Contact

- 일반 문의 / 비즈니스: official@weglow.biz
- 고객센터: 02-467-1024
- 개인정보보호책임자: 이준호 (위 연락처 동일)
