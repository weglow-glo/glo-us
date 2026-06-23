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
        author_name: string;
        location: string | null;
        rating: number;
        body: string;
        helpful_up: number;
        helpful_down: number;
        review_date: string;
      };
      const esc = (s: unknown) =>
        String(s ?? "").replace(
          /[&<>]/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
        );
      const card = (r: Rev) => {
        const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
        const date = (r.review_date || "").replace(/-/g, ".");
        return `<article class="rev-item"><div class="rev-author"><div class="rev-name">${esc(r.author_name)} <span class="loc">${esc(r.location)}</span></div><div class="rev-verified"><span class="rev-verified-dot">✓</span>체험단 후기</div></div><div class="rev-body"><div class="rev-body-stars" aria-label="${r.rating}점 / 5점">${stars}</div><p class="rev-text">${esc(r.body)}</p></div><div class="rev-meta"><div class="rev-date">${date}</div><div class="rev-helpful"><span class="rev-helpful-q">도움됐나요?</span><button class="rev-vote">↑ <span>${r.helpful_up}</span></button><button class="rev-vote">↓ <span>${r.helpful_down}</span></button></div></div></article>`;
      };

      let dynamic = false;
      let offset = 0;
      let sort = "rating_desc";
      let q = "";
      let loading = false;
      const LIMIT = 8;

      const fetchPage = async (reset: boolean) => {
        if (loading) return;
        loading = true;
        loadBtn.disabled = true;
        try {
          const res = await fetch(
            `/api/reviews?offset=${reset ? 0 : offset}&limit=${LIMIT}&sort=${sort}&q=${encodeURIComponent(q)}`,
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

    // Review "도움됐나요?" vote buttons — client-side toggle (no backend).
    const reviewsRoot = document.querySelector(".reviews");
    if (reviewsRoot) {
      const onVote = (e: Event) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".rev-vote");
        if (!btn || !reviewsRoot.contains(btn)) return;
        const span = btn.querySelector("span");
        if (!span) return;
        const n = parseInt(span.textContent || "0", 10) || 0;
        const active = btn.classList.toggle("voted");
        span.textContent = String(active ? n + 1 : Math.max(0, n - 1));
      };
      reviewsRoot.addEventListener("click", onVote);
      cleanups.push(() => reviewsRoot.removeEventListener("click", onVote));
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

  return null;
}
