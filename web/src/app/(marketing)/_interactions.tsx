"use client";

import { useEffect } from "react";

/**
 * Client-side interactions for the lift-and-shifted marketing pages.
 * The page markup is injected via dangerouslySetInnerHTML, so these
 * re-attach the behavior the original inline <script> blocks provided.
 * Each effect queries the live DOM after mount and cleans up on unmount.
 *
 * NOT generated — edit here. port-marketing.mjs only wires these in.
 */

export function ProductInteractions() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // 1) Lazy-init below-the-fold videos.
    const lazy = document.querySelectorAll<HTMLVideoElement>("video[data-lazy]");
    if (lazy.length) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              const v = e.target as HTMLVideoElement;
              v.preload = "auto";
              v.play().catch(() => {});
              obs.unobserve(v);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px 200px 0px" },
      );
      lazy.forEach((v) => obs.observe(v));
      cleanups.push(() => obs.disconnect());
    }

    // 2) Scroll-driven cumulative reveal for the .tl-rail timeline.
    const steps = [...document.querySelectorAll<HTMLElement>(".tl-step")];
    const rail = document.querySelector<HTMLElement>(".tl-rail");
    if (steps.length && rail) {
      let raf: number | null = null;
      const update = () => {
        raf = null;
        const trigger = window.innerHeight * 0.55;
        let activeIdx = -1;
        steps.forEach((s, i) => {
          if (s.getBoundingClientRect().top <= trigger) activeIdx = i;
        });
        steps.forEach((s, i) => s.classList.toggle("is-revealed", i <= activeIdx));
        if (activeIdx >= 0) {
          const n = steps[activeIdx].querySelector<HTMLElement>(".tl-node");
          if (n) {
            const railR = rail.getBoundingClientRect();
            const nR = n.getBoundingClientRect();
            rail.style.setProperty(
              "--fill",
              `${nR.top + nR.height / 2 - railR.top}px`,
            );
          }
        } else {
          rail.style.setProperty("--fill", "0px");
        }
      };
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(update);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      update();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (raf) cancelAnimationFrame(raf);
      });
    }

    // 3) FAQ accordion.
    const faqHandlers: Array<[HTMLElement, () => void]> = [];
    document.querySelectorAll<HTMLElement>(".faq-item").forEach((item) => {
      const h = () => item.classList.toggle("open");
      item.addEventListener("click", h);
      faqHandlers.push([item, h]);
    });
    cleanups.push(() =>
      faqHandlers.forEach(([el, h]) => el.removeEventListener("click", h)),
    );

    // 5) Duration option cards → update selection + buy button targets
    //    (in-box button and the mobile floating bar).
    const opts = [...document.querySelectorAll<HTMLElement>(".opt[data-key]")];
    const buyBtn = document.getElementById("buy-btn") as HTMLAnchorElement | null;
    const buyFloatBtn = document.getElementById("buy-float-btn") as HTMLAnchorElement | null;
    const buyFloatPrice = document.getElementById("buy-float-price");
    const optHandlers: Array<[HTMLElement, () => void]> = [];
    opts.forEach((card) => {
      const h = () => {
        opts.forEach((c) => {
          c.classList.remove("active");
          c.setAttribute("aria-checked", "false");
        });
        card.classList.add("active");
        card.setAttribute("aria-checked", "true");
        const key = card.dataset.key;
        const price = card.querySelector<HTMLElement>(".opt-price")?.textContent ?? "";
        if (key) {
          if (buyBtn) buyBtn.href = `/checkout?option=${key}`;
          if (buyFloatBtn) buyFloatBtn.href = `/checkout?option=${key}`;
        }
        if (buyFloatPrice && price) buyFloatPrice.textContent = price;
      };
      card.addEventListener("click", h);
      optHandlers.push([card, h]);
    });
    cleanups.push(() =>
      optHandlers.forEach(([el, h]) => el.removeEventListener("click", h)),
    );

    // 6) Reviews — load from the DB API with pagination / sort / search.
    //    Falls back to the static cards if the API is unavailable (e.g. pre-seed).
    const revList = document.getElementById("rev-list");
    const loadBtn = document.getElementById("rev-load") as HTMLButtonElement | null;
    if (revList && loadBtn) {
      type Rev = {
        id: string;
        author_name: string;
        location: string | null;
        rating: number;
        body: string;
        helpful_up: number;
        helpful_down: number;
        review_date: string;
        photos?: string[];
        videos?: string[];
        media_status?: string;
      };
      const esc = (s: unknown) =>
        String(s ?? "").replace(
          /[&<>]/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
        );
      const card = (r: Rev) => {
        const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
        const date = (r.review_date || "").replace(/-/g, ".");
        // 미디어: 검수 전(pending)엔 블러 + "검수 중", 반려(rejected)면 숨김
        const ms = r.media_status ?? "none";
        const showMedia = ms === "approved" || ms === "pending";
        const mediaHtml = !showMedia
          ? ""
          : [
              ...(r.photos ?? []).map(
                (u) => `<img src="${esc(u)}" alt="리뷰 사진" loading="lazy"/>`,
              ),
              ...(r.videos ?? []).map(
                (u) => `<video src="${esc(u)}" controls preload="metadata" playsinline></video>`,
              ),
            ].join("");
        const photos = mediaHtml
          ? `<div class="rev-photos${ms === "pending" ? " is-pending" : ""}">${mediaHtml}${
              ms === "pending" ? `<span class="rev-media-badge">검수 중</span>` : ""
            }</div>`
          : "";
        return `<article class="rev-item" data-id="${esc(r.id)}"><div class="rev-author"><div class="rev-name">${esc(r.author_name)} <span class="loc">${esc(r.location)}</span></div><div class="rev-verified"><span class="rev-verified-dot">✓</span>고객 후기</div></div><div class="rev-body"><div class="rev-body-stars" aria-label="${r.rating}점 / 5점">${stars}</div><p class="rev-text">${esc(r.body)}</p>${photos}</div><div class="rev-meta"><div class="rev-date">${date}</div><div class="rev-helpful"><span class="rev-helpful-q">도움됐나요?</span><button class="rev-vote" data-dir="up">↑ <span>${r.helpful_up}</span></button><button class="rev-vote" data-dir="down">↓ <span>${r.helpful_down}</span></button></div></div></article>`;
      };

      let dynamic = false;
      let offset = 0;
      let sort = "rating_desc";
      let q = "";
      let mediaOnly = false;
      let loading = false;
      const LIMIT = 8;

      const fetchPage = async (reset: boolean) => {
        if (loading) return;
        loading = true;
        loadBtn.disabled = true;
        try {
          const res = await fetch(
            `/api/reviews?offset=${reset ? 0 : offset}&limit=${LIMIT}&sort=${sort}&q=${encodeURIComponent(q)}${mediaOnly ? "&media=1" : ""}`,
            { cache: "no-store" },
          );
          if (!res.ok) throw new Error("reviews api");
          const d = (await res.json()) as { reviews: Rev[]; hasMore: boolean };
          if (reset) {
            revList.innerHTML = "";
            offset = 0;
          }
          revList.insertAdjacentHTML("beforeend", d.reviews.map(card).join(""));
          offset += d.reviews.length;
          loadBtn.toggleAttribute("hidden", !d.hasMore);
          if (reset && d.reviews.length === 0) {
            revList.innerHTML =
              '<p style="padding:40px 0;text-align:center;color:var(--ink-mute);font-size:14px;">검색 결과가 없어요.</p>';
          }
          dynamic = true;
        } catch {
          // API not ready — keep the static fallback cards in place.
        } finally {
          loading = false;
          loadBtn.disabled = false;
        }
      };

      // Static fallback: reveal collapsed cards in batches.
      const revealStatic = () => {
        const hidden = document.querySelectorAll<HTMLElement>(".rev-item.is-collapsed");
        hidden.forEach((el, i) => {
          if (i < 3) el.classList.remove("is-collapsed");
        });
        if (document.querySelectorAll(".rev-item.is-collapsed").length === 0)
          loadBtn.setAttribute("hidden", "");
      };

      const onLoad = () => (dynamic ? fetchPage(false) : revealStatic());
      loadBtn.addEventListener("click", onLoad);
      cleanups.push(() => loadBtn.removeEventListener("click", onLoad));

      const sortSel = document.getElementById("rev-sort") as HTMLSelectElement | null;
      const onSort = () => {
        if (!dynamic) return;
        sort = sortSel!.value;
        fetchPage(true);
      };
      sortSel?.addEventListener("change", onSort);
      cleanups.push(() => sortSel?.removeEventListener("change", onSort));

      // 포토·영상만 보기 토글
      const mediaBtn = document.getElementById("rev-media-only");
      const onMediaToggle = () => {
        mediaOnly = !mediaOnly;
        mediaBtn?.classList.toggle("is-on", mediaOnly);
        mediaBtn?.setAttribute("aria-pressed", String(mediaOnly));
        fetchPage(true);
      };
      mediaBtn?.addEventListener("click", onMediaToggle);
      cleanups.push(() => mediaBtn?.removeEventListener("click", onMediaToggle));

      const search = document.getElementById("rev-search-input") as HTMLInputElement | null;
      let deb: number | undefined;
      const onSearch = () => {
        if (!dynamic) return;
        clearTimeout(deb);
        deb = window.setTimeout(() => {
          q = search!.value.trim();
          fetchPage(true);
        }, 350);
      };
      search?.addEventListener("input", onSearch);
      cleanups.push(() => {
        clearTimeout(deb);
        search?.removeEventListener("input", onSearch);
      });

      const chipHandlers: Array<[HTMLElement, () => void]> = [];
      document.querySelectorAll<HTMLElement>(".rev-chip").forEach((chip) => {
        const h = () => {
          if (!dynamic) return;
          const kw = chip.textContent?.trim() ?? "";
          if (search) search.value = kw;
          q = kw;
          fetchPage(true);
        };
        chip.addEventListener("click", h);
        chipHandlers.push([chip, h]);
      });
      cleanups.push(() =>
        chipHandlers.forEach(([el, h]) => el.removeEventListener("click", h)),
      );

      // Initial load — try the API; static cards stay if it fails.
      void fetchPage(true);

      // 베스트 리뷰 (단가표 아래) — 정적 카드가 기본. 선정 목록
      // (app_settings.best_review_ids)이 바뀐 경우에만 API 응답으로 교체해
      // 첫 페인트 플리커를 피한다.
      const bestList = document.getElementById("best-rev-list");
      if (bestList) {
        const bestCard = (r: Rev) => {
          const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
          const date = (r.review_date || "").replace(/-/g, ".");
          const shots = (r.photos ?? [])
            .map(
              (u) =>
                `<figure class="bestrev-shot"><div class="bestrev-img" style="background-image:url('${esc(u).replace(/'/g, "%27")}')"></div></figure>`,
            )
            .join("");
          return `<article class="bestrev-card" data-id="${esc(r.id)}"><div class="bestrev-head"><span class="bestrev-badge">BEST</span><span class="bestrev-name">${esc(r.author_name)} <span>${esc(r.location ?? "")}</span></span><span class="bestrev-stars" aria-label="${r.rating}점 / 5점">${stars}</span><span class="bestrev-date">${date}</span></div>${
            shots ? `<div class="bestrev-track">${shots}</div>` : ""
          }<p class="bestrev-body">${esc(r.body)}</p></article>`;
        };
        fetch("/api/reviews/best", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { reviews: Rev[] } | null) => {
            const revs = d?.reviews ?? [];
            if (revs.length === 0) return;
            const cur = [...bestList.querySelectorAll("[data-id]")]
              .map((e) => e.getAttribute("data-id"))
              .join(",");
            if (cur === revs.map((r) => r.id).join(",")) return;
            bestList.innerHTML = revs.map(bestCard).join("");
          })
          .catch(() => {});
      }
    }

    // Sticky section tabs — scroll-spy + hide the floating nav while pinned.
    const ptabBar = document.querySelector<HTMLElement>(".ptabs");
    const ptabs = [...document.querySelectorAll<HTMLAnchorElement>(".ptab")];
    const reviewsSec = document.getElementById("reviews");
    if (ptabBar && ptabs.length && reviewsSec) {
      // Click → always jump to the section (native hash nav no-ops when the
      // hash is already set, so handle it explicitly). Instant for snappiness.
      ptabs.forEach((t) => {
        const onTabClick = (e: MouseEvent) => {
          const id = t.getAttribute("href")?.slice(1);
          const el = id ? document.getElementById(id) : null;
          if (!el) return;
          e.preventDefault();
          const y = el.getBoundingClientRect().top + window.scrollY - 56;
          window.scrollTo({ top: y, behavior: "auto" });
        };
        t.addEventListener("click", onTabClick);
        cleanups.push(() => t.removeEventListener("click", onTabClick));
      });
      let praf: number | null = null;
      const spy = () => {
        praf = null;
        // pinned once the tab bar reaches the top of the viewport
        document.body.classList.toggle("po-stuck", ptabBar.getBoundingClientRect().top <= 0);
        const reviewsActive = reviewsSec.getBoundingClientRect().top <= 80;
        ptabs.forEach((t) =>
          t.classList.toggle(
            "is-active",
            (t.getAttribute("href") === "#reviews") === reviewsActive,
          ),
        );
      };
      const onScroll = () => {
        if (praf == null) praf = requestAnimationFrame(spy);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      spy();
      cleanups.push(() => {
        window.removeEventListener("scroll", onScroll);
        document.body.classList.remove("po-stuck");
      });
    }

    // Review "도움됐나요?" votes — persisted to DB (anon RPC), deduped per device.
    const reviewsRoot = document.querySelector(".reviews");
    if (reviewsRoot) {
      const KEY = "glo-review-votes";
      const read = (): Record<string, boolean> => {
        try {
          return JSON.parse(localStorage.getItem(KEY) || "{}");
        } catch {
          return {};
        }
      };
      const write = (v: Record<string, boolean>) => {
        try {
          localStorage.setItem(KEY, JSON.stringify(v));
        } catch {
          /* private mode — ignore */
        }
      };
      // reflect this device's past votes on (re)rendered cards
      const markVotes = () => {
        const v = read();
        reviewsRoot.querySelectorAll<HTMLButtonElement>(".rev-vote").forEach((b) => {
          const id = b.closest<HTMLElement>("[data-id]")?.dataset.id;
          const dir = b.dataset.dir;
          if (id && dir) b.classList.toggle("voted", !!v[`${id}:${dir}`]);
        });
      };
      const onVote = async (e: Event) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".rev-vote");
        if (!btn || !reviewsRoot.contains(btn)) return;
        const span = btn.querySelector("span");
        if (!span) return;
        const id = btn.closest<HTMLElement>("[data-id]")?.dataset.id;
        const dir = btn.dataset.dir;
        // static fallback card (no DB id) → visual toggle only
        if (!id || (dir !== "up" && dir !== "down")) {
          const n = parseInt(span.textContent || "0", 10) || 0;
          const active = btn.classList.toggle("voted");
          span.textContent = String(active ? n + 1 : Math.max(0, n - 1));
          return;
        }
        const votes = read();
        const vkey = `${id}:${dir}`;
        const add = !votes[vkey];
        const prev = span.textContent || "0";
        const n = parseInt(prev, 10) || 0;
        // optimistic
        btn.classList.toggle("voted", add);
        span.textContent = String(add ? n + 1 : Math.max(0, n - 1));
        btn.disabled = true;
        try {
          const res = await fetch("/api/reviews/vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, dir, add }),
          });
          if (!res.ok) throw new Error("vote failed");
          const data = (await res.json()) as { helpful_up: number; helpful_down: number };
          span.textContent = String(dir === "up" ? data.helpful_up : data.helpful_down);
          if (add) votes[vkey] = true;
          else delete votes[vkey];
          write(votes);
        } catch {
          // revert on failure
          btn.classList.toggle("voted", !add);
          span.textContent = prev;
        } finally {
          btn.disabled = false;
        }
      };
      reviewsRoot.addEventListener("click", onVote);
      const mo = new MutationObserver(markVotes);
      mo.observe(reviewsRoot, { childList: true, subtree: true });
      markVotes();
      cleanups.push(() => {
        reviewsRoot.removeEventListener("click", onVote);
        mo.disconnect();
      });

      // 리뷰 미디어 라이트박스 — 썸네일 클릭 시 확대, 좌우/스와이프로 넘김.
      // 검수 중(is-pending) 미디어는 pointer-events:none이라 열리지 않는다.
      const lb = document.createElement("div");
      lb.className = "rev-lb";
      lb.hidden = true;
      lb.setAttribute("role", "dialog");
      lb.setAttribute("aria-modal", "true");
      lb.setAttribute("aria-label", "리뷰 사진 크게 보기");
      lb.innerHTML =
        '<button type="button" class="rev-lb-close" aria-label="닫기">✕</button>' +
        '<button type="button" class="rev-lb-nav rev-lb-prev" aria-label="이전">‹</button>' +
        '<div class="rev-lb-media"></div>' +
        '<button type="button" class="rev-lb-nav rev-lb-next" aria-label="다음">›</button>' +
        '<span class="rev-lb-count"></span>';
      document.body.appendChild(lb);
      const lbMedia = lb.querySelector<HTMLElement>(".rev-lb-media")!;
      const lbCount = lb.querySelector<HTMLElement>(".rev-lb-count")!;
      const lbPrev = lb.querySelector<HTMLButtonElement>(".rev-lb-prev")!;
      const lbNext = lb.querySelector<HTMLButtonElement>(".rev-lb-next")!;

      let lbItems: Array<{ type: "img" | "video"; src: string }> = [];
      let lbIdx = 0;
      const lbRender = () => {
        const it = lbItems[lbIdx];
        if (!it) return;
        lbMedia.innerHTML =
          it.type === "video"
            ? `<video src="${it.src}" controls autoplay playsinline></video>`
            : `<img src="${it.src}" alt="리뷰 사진 크게 보기"/>`;
        const many = lbItems.length > 1;
        lbCount.style.display = many ? "" : "none";
        lbPrev.style.display = many ? "" : "none";
        lbNext.style.display = many ? "" : "none";
        lbCount.textContent = `${lbIdx + 1} / ${lbItems.length}`;
        lbPrev.disabled = lbIdx === 0;
        lbNext.disabled = lbIdx === lbItems.length - 1;
      };
      const lbOpen = (items: typeof lbItems, idx: number) => {
        lbItems = items;
        lbIdx = idx;
        lb.hidden = false;
        document.body.style.overflow = "hidden";
        lbRender();
      };
      const lbClose = () => {
        lb.hidden = true;
        lbMedia.innerHTML = ""; // 재생 중 영상 정지
        document.body.style.overflow = "";
      };
      const lbStep = (d: number) => {
        const next = lbIdx + d;
        if (next < 0 || next >= lbItems.length) return;
        lbIdx = next;
        lbRender();
      };

      const onThumbClick = (e: Event) => {
        const t = e.target as HTMLElement;
        const el = t.closest(".rev-photos:not(.is-pending) img, .rev-photos:not(.is-pending) video");
        if (!el) return;
        const wrap = el.closest(".rev-photos")!;
        const all = [...wrap.querySelectorAll<HTMLElement>("img, video")];
        const items = all.map((m) => ({
          type: (m.tagName === "VIDEO" ? "video" : "img") as "img" | "video",
          src: (m as HTMLImageElement | HTMLVideoElement).src,
        }));
        lbOpen(items, all.indexOf(el as HTMLElement));
      };
      const onLbClick = (e: Event) => {
        const t = e.target as HTMLElement;
        if (t.closest(".rev-lb-close")) return lbClose();
        if (t.closest(".rev-lb-prev")) return lbStep(-1);
        if (t.closest(".rev-lb-next")) return lbStep(1);
        if (!t.closest(".rev-lb-media *")) lbClose(); // 배경 클릭
      };
      const onLbKey = (e: KeyboardEvent) => {
        if (lb.hidden) return;
        if (e.key === "Escape") lbClose();
        if (e.key === "ArrowLeft") lbStep(-1);
        if (e.key === "ArrowRight") lbStep(1);
      };
      // 스와이프
      let touchX: number | null = null;
      const onTouchStart = (e: TouchEvent) => {
        touchX = e.touches[0]?.clientX ?? null;
      };
      const onTouchEnd = (e: TouchEvent) => {
        if (touchX === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
        touchX = null;
        if (Math.abs(dx) > 40) lbStep(dx < 0 ? 1 : -1);
      };
      reviewsRoot.addEventListener("click", onThumbClick);
      lb.addEventListener("click", onLbClick);
      lb.addEventListener("touchstart", onTouchStart, { passive: true });
      lb.addEventListener("touchend", onTouchEnd, { passive: true });
      document.addEventListener("keydown", onLbKey);
      cleanups.push(() => {
        reviewsRoot.removeEventListener("click", onThumbClick);
        document.removeEventListener("keydown", onLbKey);
        document.body.style.overflow = "";
        lb.remove();
      });
    }

    // "현재 N명이 보고 있어요" — random 20–80, drifts a little to feel live.
    const liveN = document.getElementById("po-live-n");
    if (liveN) {
      const LO = 20;
      const HI = 80;
      const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
      let v = rand(LO, HI);
      liveN.textContent = String(v);
      const drift = () => {
        v += rand(0, 6) - 3; // -3..+3
        if (v < LO) v = LO + rand(0, 3);
        if (v > HI) v = HI - rand(0, 3);
        liveN.textContent = String(v);
      };
      const liveIv = window.setInterval(drift, 3500);
      cleanups.push(() => clearInterval(liveIv));
    }

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}

export function ScienceInteractions() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const SEL = "svg text, svg line, svg polyline, svg polygon";

    const scatter = (mol: Element) => {
      mol.querySelectorAll<HTMLElement | SVGElement>(SEL).forEach((el, i) => {
        const rx = (Math.random() - 0.5) * 100;
        const ry = (Math.random() - 0.5) * 70;
        const rot = (Math.random() - 0.5) * 40;
        const s = (el as HTMLElement).style;
        s.transformBox = "fill-box";
        s.transformOrigin = "center";
        s.transition = `transform 1.7s cubic-bezier(.34,1.2,.64,1) ${i * 65}ms, opacity 1s ease ${i * 65}ms`;
        s.transform = `translate(${rx}px, ${ry}px) rotate(${rot}deg)`;
        s.opacity = "0";
      });
    };
    const assemble = (mol: Element) => {
      mol.querySelectorAll<HTMLElement | SVGElement>(SEL).forEach((el) => {
        const s = (el as HTMLElement).style;
        s.transform = "translate(0,0) rotate(0)";
        s.opacity = "1";
      });
    };

    // Lift each .mol to be a direct child of its .ing card.
    document.querySelectorAll<HTMLElement>(".mol").forEach((mol) => {
      const card = mol.closest(".ing");
      if (card && mol.parentElement !== card) card.appendChild(mol);
    });

    document.querySelectorAll<HTMLElement>(".mol").forEach(scatter);

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            assemble(e.target);
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.3 },
    );
    document.querySelectorAll<HTMLElement>(".mol").forEach((m) => obs.observe(m));

    return () => obs.disconnect();
  }, []);

  // 성분별 임상 근거 모달 + 주요 출처 아코디언.
  // reduced-motion과 무관하게 항상 동작해야 하므로 별도 effect로 둔다.
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    const modal = document.getElementById("ev-modal");
    const content = modal?.querySelector<HTMLElement>(".ev-content");
    if (modal && content) {
      let lastFocus: HTMLElement | null = null;
      const open = (key: string, trigger: HTMLElement) => {
        const src = document.getElementById(`ev-${key}`);
        if (!src) return;
        lastFocus = trigger;
        content.innerHTML = src.innerHTML;
        modal.hidden = false;
        document.body.style.overflow = "hidden";
        modal.querySelector<HTMLButtonElement>(".ev-x")?.focus();
      };
      const close = () => {
        modal.hidden = true;
        content.innerHTML = "";
        document.body.style.overflow = "";
        lastFocus?.focus();
        lastFocus = null;
      };
      const onClick = (e: Event) => {
        const t = e.target as HTMLElement;
        const btn = t.closest<HTMLElement>(".ing-ev[data-ev]");
        if (btn?.dataset.ev) return open(btn.dataset.ev, btn);
        if (t.closest("[data-ev-close]")) close();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !modal.hidden) close();
      };
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      cleanups.push(() => {
        document.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = "";
      });
    }

    // 아코디언 — 한 번에 하나만 열린다.
    const items = [...document.querySelectorAll<HTMLElement>(".acc-item")];
    if (items.length) {
      const onAcc = (e: Event) => {
        const q = (e.target as HTMLElement).closest<HTMLElement>(".acc-q");
        if (!q) return;
        const item = q.closest<HTMLElement>(".acc-item");
        if (!item) return;
        const willOpen = !item.hasAttribute("data-open");
        items.forEach((it) => {
          it.removeAttribute("data-open");
          it.querySelector(".acc-q")?.setAttribute("aria-expanded", "false");
        });
        if (willOpen) {
          item.setAttribute("data-open", "1");
          q.setAttribute("aria-expanded", "true");
        }
      };
      const acc = items[0].parentElement;
      acc?.addEventListener("click", onAcc);
      cleanups.push(() => acc?.removeEventListener("click", onAcc));
    }

    return () => cleanups.forEach((c) => c());
  }, []);

  return null;
}

/**
 * Landing-page motion: hero entrance choreography, scroll-driven section
 * reveals, stat count-ups, and a subtle hero parallax. GSAP is imported
 * dynamically so other marketing pages pay zero bundle cost. Everything is
 * additive — with JS off (or reduced motion) the page renders untouched.
 */
export function LandingInteractions() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    const cleanups: Array<() => void> = [];
    const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
      document.querySelector<T>(sel);

    // 홈 전용 네비 상태 — 맨 위에선 숨기고, 마스트헤드가 물러나면 등장
    const htmlEl = document.documentElement;
    htmlEl.classList.add("glo-home-nav");
    if (reduce) htmlEl.classList.add("glo-nav-on");
    cleanups.push(() => htmlEl.classList.remove("glo-home-nav", "glo-nav-on"));

    // ── reduced-motion: 정적 상태 세팅 (CSS 폴백 + 값 채움) ─────────
    if (reduce) {
      const rotV = $<HTMLVideoElement>("#rotVideo");
      if (rotV) rotV.currentTime = 0;
      const baV = $<HTMLVideoElement>("#baVideo");
      if (baV) {
        const toEnd = () => {
          baV.currentTime = Math.max(0, (baV.duration || 0) - 0.05);
        };
        if (baV.duration) toEnd();
        else baV.addEventListener("loadedmetadata", toEnd, { once: true });
      }
      const baWk = $("#baWk");
      if (baWk) baWk.textContent = "Week 12+";
      const stages = document.querySelectorAll(".bstage");
      stages.forEach((b, j) => b.classList.toggle("on", j === stages.length - 1));
      document.querySelectorAll<HTMLElement>(".sm-fill").forEach((f) => {
        f.style.width = `${f.dataset.w ?? 0}%`;
      });
      document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const end = parseFloat(el.dataset.count ?? "0");
        const dec = parseInt(el.dataset.dec ?? "0", 10);
        el.textContent = end.toLocaleString("ko-KR", {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        });
      });
      const price = $("#rsPrice");
      if (price) price.textContent = "83,300";
    }

    (async () => {
      // ── GSAP 파트 (reduce 면 통째로 생략 — CSS 폴백이 담당) ──────
      if (!reduce) {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (disposed) return;
        gsap.registerPlugin(ScrollTrigger);
        // 모바일에서 주소창이 나타나고 사라질 때의 높이만 바뀌는 리사이즈는
        // 무시 — 이걸 안 하면 위로 스크롤할 때마다 스크럽 요소가 팍 튄다
        ScrollTrigger.config({ ignoreMobileResize: true });
        let rotTarget = 0;
        let baTarget = 0;

        // 백그라운드 탭에서 열리면 rAF 가 멈춰 있으므로 보일 때까지 대기
        if (document.hidden) {
          await new Promise<void>((resolve) => {
            const onVis = () => {
              if (!document.hidden) {
                document.removeEventListener("visibilitychange", onVis);
                resolve();
              }
            };
            document.addEventListener("visibilitychange", onVis);
            cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
          });
          if (disposed) return;
        }

        // 헤드라인 문자 분해 — .au(background-clip:text) 래퍼는 통째로
        // 하나의 .ch 로 (글자 단위로 쪼개면 배경이 자식 레이어에 안 그려짐)
        const splitNode = (node: Node, out: HTMLElement) => {
          Array.from(node.childNodes).forEach((n) => {
            if (n.nodeType === 3) {
              (n.nodeValue ?? "").split("").forEach((c) => {
                const s = document.createElement("span");
                s.className = "ch";
                // inline-block 스팬 안의 일반 공백은 폭이 0으로 붕괴 → nbsp
                s.textContent = c === " " ? " " : c;
                out.appendChild(s);
              });
            } else if (n.nodeType === 1) {
              const wrap = (n as HTMLElement).cloneNode(true) as HTMLElement;
              wrap.classList.add("ch");
              out.appendChild(wrap);
            }
          });
        };
        document.querySelectorAll("[data-split]").forEach((el) => {
          const line = document.createElement("span");
          line.className = "ln";
          splitNode(el, line);
          el.innerHTML = "";
          el.appendChild(line);
        });

        const ctx = gsap.context(() => {
          // 진행 바
          gsap.to("#prog", {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: document.body,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.3,
            },
          });

          // 히어로 진입 안무
          const tl = gsap.timeline({ delay: 0.25 });
          tl.from(".hero-brand", { opacity: 0, y: -16, duration: 1.0, ease: "power2.out" })
            .from(".hero-kicker", { opacity: 0, y: 16, duration: 0.8, ease: "power2.out" }, "-=.55")
            .from(".ch", { yPercent: 118, opacity: 0, duration: 1.05, stagger: 0.022, ease: "expo.out" }, "-=.45")
            .from(".hero-sub", { opacity: 0, y: 18, duration: 0.8, ease: "power2.out" }, "-=.55")
            .from(".hs-float", { opacity: 0, scale: 0.9, duration: 1.5, ease: "expo.out" }, "-=1.2")
            .from(".scroll-cue", { opacity: 0, duration: 0.7 }, "-=.5");

          // 사쉐 부유
          /* 애니메이션 3겹 분리 — 요소당 트윈 하나씩이라 어떤 refresh 도
             서로의 기준값을 오염시킬 수 없다.
             #heroSachet: 센터링(CSS) + 패럴랙스 / #hsFloat: 부유 / #hsImg: 틸트 */
          const sachet = $("#heroSachet");
          const hsFloat = $("#hsFloat");
          if (hsFloat) {
            gsap.to(hsFloat, { y: "+=18", duration: 3.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
          }

          // 히어로 패럴랙스 아웃 + 마스트헤드 스크럽 (fromTo — 시작값 명시)
          gsap.to(".hero-in", {
            yPercent: -18,
            opacity: 0,
            ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 },
          });
          if (sachet) {
            gsap.fromTo(sachet,
              { yPercent: 0 },
              {
                yPercent: 26,
                ease: "none",
                immediateRender: false,
                scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 },
              });
          }
          gsap.fromTo(
            ".hero-brand",
            { yPercent: 0, opacity: 1 },
            {
              yPercent: -70,
              opacity: 0,
              ease: "none",
              immediateRender: false,
              scrollTrigger: { trigger: ".hero", start: "top top", end: "55% top", scrub: 0.8 },
            },
          );
          // 마스트헤드가 물러나는 지점부터 상단 바 등장 (역스크롤 시 다시 숨김)
          ScrollTrigger.create({
            trigger: ".hero",
            start: "38% top",
            end: "max",
            onToggle: (self) => htmlEl.classList.toggle("glo-nav-on", self.isActive),
          });

          // ── 회전 섹션: 스크럽 타깃 + 후반부 스펙 시트 페이즈 ──────
          const v = $<HTMLVideoElement>("#rotVideo");
          const rotSpec = $("#rotSpec");
          const rsRows = document.querySelectorAll("#rsRows .rs-row");
          const rsPrice = $("#rsPrice");
          const rotListEl = $(".rot-list");
          const plinthEl = $(".rot-plinth");
          let pricePlayed = false;
          const cl = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

          if (v) {
            ScrollTrigger.create({
              trigger: "#rot",
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              onUpdate: (self) => {
                const pr = self.progress;
                rotTarget = pr;
                if (!rotSpec || !rotListEl || !plinthEl) return;
                const k = cl((pr - 0.55) / 0.17, 0, 1);
                const ke = k * k * (3 - 2 * k); // smoothstep
                v.style.transform = `translateX(${-ke * 20}vw) scale(${1 - ke * 0.16})`;
                plinthEl.style.transform = `translateX(calc(-50% - ${ke * 20}vw)) scale(${1 - ke * 0.16})`;
                rotListEl.style.opacity = String(1 - ke);
                rotSpec.style.opacity = String(ke);
                rotSpec.style.transform =
                  window.innerWidth <= 900
                    ? `translateX(-50%) translateY(${(1 - ke) * 24}px)`
                    : `translateY(-50%) translateX(${(1 - ke) * 48}px)`;
                rsRows.forEach((r, i) => r.classList.toggle("on", pr > 0.7 + i * 0.033));
                if (pr >= 0.9 && !pricePlayed && rsPrice) {
                  pricePlayed = true;
                  const po = { n: 0 };
                  gsap.to(po, {
                    n: 83300,
                    duration: 1.1,
                    ease: "power2.out",
                    onUpdate: () => {
                      rsPrice.textContent = Math.round(po.n).toLocaleString("ko-KR");
                    },
                  });
                }
                if (pr < 0.8) pricePlayed = false;
              },
            });
          }

          // 좌측 신뢰 체크리스트 — 진행도에 따라 하나씩 쌓인다
          document.querySelectorAll<HTMLElement>(".rli").forEach((el) => {
            const at = parseFloat(el.dataset.at ?? "0");
            let shown = false;
            ScrollTrigger.create({
              trigger: "#rot",
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              onUpdate: (self) => {
                const want = self.progress >= at;
                if (want === shown) return;
                shown = want;
                gsap.to(el, {
                  opacity: want ? 1 : 0,
                  x: want ? 0 : -16,
                  duration: 0.55,
                  ease: "power2.out",
                  overwrite: "auto",
                });
              },
            });
          });

          // 액체 원형 마스크 확장
          if ($("#liqMask")) {
            gsap.fromTo(
              "#liqMask",
              { clipPath: "circle(30% at 50% 50%)" },
              {
                clipPath: "circle(78% at 50% 50%)",
                ease: "none",
                scrollTrigger: { trigger: "#liq", start: "top top", end: "bottom bottom", scrub: 0.8 },
              },
            );
          }

          // 일반 스크롤 리빌
          gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
            gsap.from(el, {
              opacity: 0,
              y: 26,
              duration: 0.85,
              ease: "expo.out",
              scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" },
            });
          });
          gsap.utils.toArray<HTMLElement>("[data-fade]").forEach((el) => {
            gsap.from(el, {
              opacity: 0,
              duration: 0.8,
              scrollTrigger: { trigger: el, start: "top 92%" },
            });
          });

          // ── 피부 변화 스크럽: 배지·레일·우측 카피 동기화 ─────────
          const baWkEl = $("#baWk");
          const baFill = $("#baFill");
          const bstages = document.querySelectorAll(".bstage");
          const BA_WEEKS = ["복용 전", "Day 5–7", "Week 4–8", "Week 12+"];
          let baIdx = 0;
          if (baWkEl && baFill) {
            ScrollTrigger.create({
              trigger: "#ba",
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              onUpdate: (self) => {
                baTarget = self.progress;
                baFill.style.transform = `scaleX(${self.progress})`;
                const idx = Math.min(3, Math.round(self.progress * 3));
                if (idx !== baIdx) {
                  baIdx = idx;
                  baWkEl.textContent = BA_WEEKS[idx];
                  bstages.forEach((b, j) => b.classList.toggle("on", j === idx));
                }
              },
            });
          }

          // 오비트 진입 리빌 (.node 는 인라인 transform → 안쪽만)
          gsap.from("#ring .node-d", {
            opacity: 0,
            scale: 0.55,
            duration: 0.8,
            stagger: 0.07,
            ease: "expo.out",
            scrollTrigger: { trigger: ".orb-wrap", start: "top 82%" },
          });

          // 숫자 카운트업 — 핀 스페이서 때문에 로드시 미리 재생되는 것
          // 방지: 뷰포트에 들어올 때마다 재생
          document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
            const end = parseFloat(el.dataset.count ?? "0");
            const dec = parseInt(el.dataset.dec ?? "0", 10);
            const o = { n: 0 };
            gsap.to(o, {
              n: end,
              duration: 2.2,
              ease: "expo.out",
              scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "restart none none reset" },
              onUpdate: () => {
                el.textContent = o.n.toLocaleString("ko-KR", {
                  minimumFractionDigits: dec,
                  maximumFractionDigits: dec,
                });
              },
            });
          });

          // 스캔 메트릭 바
          document.querySelectorAll<HTMLElement>(".sm-fill").forEach((f) => {
            gsap.fromTo(
              f,
              { width: "0%" },
              {
                width: `${f.dataset.w ?? 0}%`,
                duration: 1.1,
                ease: "power2.out",
                scrollTrigger: { trigger: f, start: "top 92%", once: true },
              },
            );
          });
        });
        cleanups.push(() => ctx.revert());

        // ── 커서 글로우 + 사쉐 틸트 (포인터 기기) ────────────────
        if (window.matchMedia("(pointer:fine)").matches) {
          const glow = $("#glow");
          const sachet = $("#heroSachet");
          const onMove = (e: PointerEvent) => {
            if (glow) {
              glow.style.opacity = "1";
              gsap.to(glow, { x: e.clientX, y: e.clientY, duration: 0.9, ease: "power3.out", overwrite: true });
            }
            const hsImg = document.getElementById("hsImg");
            if (hsImg) {
              const nx = e.clientX / window.innerWidth - 0.5;
              const ny = e.clientY / window.innerHeight - 0.5;
              gsap.to(hsImg, {
                rotateY: nx * 22,
                rotateX: -ny * 16,
                x: nx * 26,
                transformPerspective: 900,
                duration: 1.1,
                ease: "power3.out",
                overwrite: "auto",
              });
            }
          };
          window.addEventListener("pointermove", onMove, { passive: true });
          cleanups.push(() => window.removeEventListener("pointermove", onMove));
        }

        // ── 영상 스크럽 (캐니스터 + 피부 변화 공용 rAF) ──────────
        const v = $<HTMLVideoElement>("#rotVideo");
        const baV = $<HTMLVideoElement>("#baVideo");
        let rotCur = 0;
        let baCur = 0;
        let rotReady = false;
        let baReady = false;
        if (v) {
          const seed = () => {
            if (!rotReady && v.duration) {
              rotReady = true;
              v.pause();
            }
          };
          v.addEventListener("loadedmetadata", seed);
          if (v.readyState >= 1) seed();
        }
        if (baV) {
          const seed = () => {
            if (!baReady && baV.duration) {
              baReady = true;
              baV.pause();
            }
          };
          baV.addEventListener("loadedmetadata", seed);
          if (baV.readyState >= 1) seed();
        }
        const scrubTo = (el: HTMLVideoElement, cur: number, tgt: number) => {
          const nc = cur + (tgt - cur) * 0.12;
          const t = nc * (el.duration - 0.05);
          if (Math.abs(el.currentTime - t) > 0.008) el.currentTime = t;
          return nc;
        };
        /* 본 영상은 해당 섹션이 2뷰포트 안으로 오면 그때 전체 로드 —
           첫 진입 대역폭을 포스터+메타데이터 수준으로 줄인다 */
        const lazyFull = (vid: HTMLVideoElement | null, trigSel: string) => {
          if (!vid) return;
          const sec = document.querySelector(trigSel);
          if (!sec || !("IntersectionObserver" in window)) {
            vid.preload = "auto";
            return;
          }
          const io = new IntersectionObserver(
            (es) => {
              if (es.some((x) => x.isIntersecting)) {
                vid.preload = "auto";
                vid.load();
                io.disconnect();
              }
            },
            { rootMargin: "200% 0px" },
          );
          io.observe(sec);
          cleanups.push(() => io.disconnect());
        };
        lazyFull(v, "#rot");
        lazyFull(baV, "#ba");
        lazyFull($<HTMLVideoElement>("#liqVideo"), "#liq");

        let scrubRaf = 0;
        const scrubTick = () => {
          if (v && rotReady && v.duration) rotCur = scrubTo(v, rotCur, rotTarget);
          if (baV && baReady && baV.duration) baCur = scrubTo(baV, baCur, baTarget);
          scrubRaf = requestAnimationFrame(scrubTick);
        };
        scrubRaf = requestAnimationFrame(scrubTick);
        cleanups.push(() => cancelAnimationFrame(scrubRaf));

        // ── 4단계 링: 배치 + 자동/드래그 회전 + 관성 ─────────────
        const ring = $("#ring");
        const orbWrap = $(".orb-wrap");
        if (ring && orbWrap) {
          const nodes = ring.querySelectorAll<HTMLElement>(".node");
          const layout = () => {
            const w = orbWrap.getBoundingClientRect().width || window.innerWidth || 1024;
            const R = Math.max(175, Math.min(w * 0.34, 350));
            nodes.forEach((n, i) => {
              const a = (360 / nodes.length) * i;
              n.style.transform = `rotateY(${a}deg) translateZ(${R}px)`;
            });
          };
          layout();
          const ro = new ResizeObserver(() => layout());
          ro.observe(orbWrap);
          cleanups.push(() => ro.disconnect());
          // 주소창 개폐(높이만 변화)는 무시 — 가로폭이 바뀔 때만 전체 재계산
          let lastW = window.innerWidth;
          const onWinResize = () => {
            if (Math.abs(window.innerWidth - lastW) < 1) return;
            lastW = window.innerWidth;
            layout();
            ScrollTrigger.refresh();
          };
          window.addEventListener("resize", onWinResize, { passive: true });
          cleanups.push(() => window.removeEventListener("resize", onWinResize));

          let ringRot = 0;
          let dragVel = 0;
          let dragging = false;
          let lastX = 0;
          let hoverPause = false;
          let dragDist = 0;
          const RING_AUTO = 0.18;
          /* 주의: setPointerCapture 를 쓰면 click 이 래퍼에서 합성되어
             카드 <a> 가 클릭을 못 받는다 (탭해도 이동 안 되는 버그의 원인).
             캡처 없이 window 레벨로 드래그를 추적한다. */
          const onMove = (e: PointerEvent) => {
            if (!dragging) return;
            const dx = e.clientX - lastX;
            lastX = e.clientX;
            dragDist += Math.abs(dx);
            ringRot += dx * 0.4;
            dragVel = dx * 0.4;
          };
          const endDrag = () => {
            dragging = false;
            orbWrap.classList.remove("dragging");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", endDrag);
            window.removeEventListener("pointercancel", endDrag);
          };
          const onDown = (e: PointerEvent) => {
            dragging = true;
            lastX = e.clientX;
            dragVel = 0;
            dragDist = 0;
            orbWrap.classList.add("dragging");
            window.addEventListener("pointermove", onMove, { passive: true });
            window.addEventListener("pointerup", endDrag);
            window.addEventListener("pointercancel", endDrag);
          };
          const onClick = (e: MouseEvent) => {
            // 끌고 난 뒤의 click 은 링크 이동으로 치지 않는다
            if (dragDist > 6) {
              e.preventDefault();
              e.stopPropagation();
            }
          };
          orbWrap.addEventListener("pointerdown", onDown);
          orbWrap.addEventListener("click", onClick, true);
          cleanups.push(() => {
            orbWrap.removeEventListener("pointerdown", onDown);
            orbWrap.removeEventListener("click", onClick, true);
            endDrag();
          });
          if (window.matchMedia("(pointer:fine)").matches) {
            const enter = () => {
              hoverPause = true;
            };
            const leave = () => {
              hoverPause = false;
            };
            orbWrap.addEventListener("pointerenter", enter);
            orbWrap.addEventListener("pointerleave", leave);
            cleanups.push(() => {
              orbWrap.removeEventListener("pointerenter", enter);
              orbWrap.removeEventListener("pointerleave", leave);
            });
          }
          let ringRaf = 0;
          const ringLoop = () => {
            if (!dragging) {
              if (Math.abs(dragVel) > 0.06) {
                ringRot += dragVel;
                dragVel *= 0.94;
              } else if (!hoverPause) {
                ringRot += RING_AUTO;
              }
            }
            ring.style.transform = `rotateY(${ringRot}deg)`;
            ringRaf = requestAnimationFrame(ringLoop);
          };
          ringRaf = requestAnimationFrame(ringLoop);
          cleanups.push(() => cancelAnimationFrame(ringRaf));
        }

        // 폰트·이미지·비디오 로드 후 핀/트리거 위치 재계산 — 이게 없으면
        // 위 핀 스페이서들이 자산 로드로 밀리면서 모든 리빌 위치가 어긋난다
        if (document.fonts?.ready) {
          document.fonts.ready.then(() => {
            if (!disposed) ScrollTrigger.refresh();
          });
        }
        const onLoad = () => {
          if (!disposed) ScrollTrigger.refresh();
        };
        if (document.readyState === "complete") onLoad();
        else {
          window.addEventListener("load", onLoad);
          cleanups.push(() => window.removeEventListener("load", onLoad));
        }
        const lateRefresh = window.setTimeout(onLoad, 2500); // 안전망
        cleanups.push(() => window.clearTimeout(lateRefresh));
      }

      // ── AI 얼굴 스캔 (three) — reduce 는 정적 1프레임 ────────────
      const stage = document.getElementById("scanStage");
      if (stage) {
        const [THREE, { FACE_V, FACE_E }] = await Promise.all([
          import("three"),
          import("./_face-mesh"),
        ]);
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "low-power",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        stage.prepend(renderer.domElement);

        const scene = new THREE.Scene();
        const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
        cam.position.set(0, 0, 27);
        const group = new THREE.Group();
        group.position.y = 0.4;
        scene.add(group);

        const n = FACE_V.length;
        const pos = new Float32Array(n * 3);
        FACE_V.forEach((p, i) => pos.set(p, i * 3));
        const colors = new Float32Array(n * 3);
        const pgeo = new THREE.BufferGeometry();
        pgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        pgeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const points = new THREE.Points(
          pgeo,
          new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.95 }),
        );
        group.add(points);

        const epos = new Float32Array(FACE_E.length * 6);
        FACE_E.forEach(([a, b], i) => {
          epos.set(FACE_V[a], i * 6);
          epos.set(FACE_V[b], i * 6 + 3);
        });
        const lgeo = new THREE.BufferGeometry();
        lgeo.setAttribute("position", new THREE.BufferAttribute(epos, 3));
        const lines = new THREE.LineSegments(
          lgeo,
          new THREE.LineBasicMaterial({ color: 0xb88787, transparent: true, opacity: 0.16 }),
        );
        group.add(lines);

        const resize = () => {
          const r = stage.getBoundingClientRect();
          if (!r.width || !r.height) return;
          renderer.setSize(r.width, r.height, false);
          cam.aspect = r.width / r.height;
          cam.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(stage);

        let px = 0;
        let py = 0;
        const onMove = (e: PointerEvent) => {
          px = e.clientX / window.innerWidth - 0.5;
          py = e.clientY / window.innerHeight - 0.5;
        };
        window.addEventListener("pointermove", onMove, { passive: true });

        const tags = [...stage.querySelectorAll<HTMLElement>(".scan-tag")].map((el) => ({
          el,
          i: parseInt(el.dataset.anchor ?? "0", 10),
        }));
        const scanEl = document.getElementById("scanLine");
        const v3 = new THREE.Vector3();
        const YMAX = 9;
        const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

        if (reduce) {
          for (let i = 0; i < n; i++) {
            colors[i * 3] = 0.78;
            colors[i * 3 + 1] = 0.66;
            colors[i * 3 + 2] = 0.66;
          }
          (pgeo.attributes.color as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
          renderer.render(scene, cam);
          tags.forEach(({ el }) => {
            el.style.opacity = "0";
          });
          cleanups.push(() => {
            ro.disconnect();
            window.removeEventListener("pointermove", onMove);
            pgeo.dispose();
            lgeo.dispose();
            (points.material as InstanceType<typeof THREE.PointsMaterial>).dispose();
            (lines.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();
            renderer.dispose();
            renderer.domElement.remove();
          });
          return;
        }

        const { ScrollTrigger } = await import("gsap/ScrollTrigger");
        let scrollRot = 0;
        const rotST = ScrollTrigger.create({
          trigger: "#scan",
          start: "top bottom",
          end: "bottom top",
          scrub: 0.5,
          onUpdate: (self) => {
            scrollRot = (self.progress - 0.5) * 1.15;
          },
        });

        let raf = 0;
        let running = false;
        const clock = new THREE.Clock();
        const render = () => {
          raf = requestAnimationFrame(render);
          const t = clock.getElapsedTime();
          const ramp = Math.min(t / 1.6, 1);
          group.rotation.y = Math.sin(t * 0.3) * 0.42 + px * 0.38 + scrollRot;
          group.rotation.x = Math.sin(t * 0.19) * 0.07 + py * 0.2;

          const scanY = Math.sin(t * 0.45) * (YMAX * 0.72);
          for (let i = 0; i < n; i++) {
            const k = Math.max(0, 1 - Math.abs(FACE_V[i][1] - scanY) / 1.5);
            colors[i * 3] = 0.7 + k * 0.28;
            colors[i * 3 + 1] = 0.62 + k * 0.16;
            colors[i * 3 + 2] = 0.62 + k * 0.16;
          }
          (pgeo.attributes.color as InstanceType<typeof THREE.BufferAttribute>).needsUpdate = true;
          if (scanEl) {
            scanEl.style.top = `${50 - (scanY / YMAX) * 36}%`;
            scanEl.style.opacity = String(0.75 * ramp);
          }

          renderer.render(scene, cam);

          for (const { el, i } of tags) {
            const p = FACE_V[i];
            v3.set(p[0], p[1], p[2]);
            group.localToWorld(v3);
            const facing = clamp((v3.z + 2) / 4, 0, 1);
            v3.project(cam);
            el.style.left = `${clamp((v3.x * 0.5 + 0.5) * 100, 8, 92)}%`;
            el.style.top = `${clamp((-v3.y * 0.5 + 0.5) * 100, 6, 92)}%`;
            el.style.opacity = String(facing * ramp);
          }
        };
        const setRunning = (on: boolean) => {
          if (on === running) return;
          running = on;
          if (on) {
            clock.start();
            render();
          } else {
            cancelAnimationFrame(raf);
          }
        };
        const visST = ScrollTrigger.create({
          trigger: "#scan",
          start: "top 98%",
          end: "bottom top",
          onToggle: (self) => setRunning(self.isActive),
        });
        if (visST.isActive) setRunning(true);

        cleanups.push(() => {
          setRunning(false);
          rotST.kill();
          visST.kill();
          ro.disconnect();
          window.removeEventListener("pointermove", onMove);
          pgeo.dispose();
          lgeo.dispose();
          (points.material as InstanceType<typeof THREE.PointsMaterial>).dispose();
          (lines.material as InstanceType<typeof THREE.LineBasicMaterial>).dispose();
          renderer.dispose();
          renderer.domElement.remove();
        });
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
    };
  }, []);

  return null;
}
