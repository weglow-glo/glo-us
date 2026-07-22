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
      };
      const esc = (s: unknown) =>
        String(s ?? "").replace(
          /[&<>]/g,
          (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
        );
      const card = (r: Rev) => {
        const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
        const date = (r.review_date || "").replace(/-/g, ".");
        return `<article class="rev-item" data-id="${esc(r.id)}"><div class="rev-author"><div class="rev-name">${esc(r.author_name)} <span class="loc">${esc(r.location)}</span></div><div class="rev-verified"><span class="rev-verified-dot">✓</span>체험단 후기</div></div><div class="rev-body"><div class="rev-body-stars" aria-label="${r.rating}점 / 5점">${stars}</div><p class="rev-text">${esc(r.body)}</p></div><div class="rev-meta"><div class="rev-date">${date}</div><div class="rev-helpful"><span class="rev-helpful-q">도움됐나요?</span><button class="rev-vote" data-dir="up">↑ <span>${r.helpful_up}</span></button><button class="rev-vote" data-dir="down">↓ <span>${r.helpful_down}</span></button></div></div></article>`;
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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);

      // If the tab is hidden (opened in background), rAF doesn't run — defer
      // init until first visible so nothing sits at its hidden "from" state
      // and the hero choreography plays when the page is actually seen.
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

      const ctx = gsap.context(() => {
        // ── 1) Hero entrance choreography ─────────────────────────────
        const heroBits = [
          ".hero .ey",
          ".hero h1",
          ".hero .hero-sub",
          ".hero .hero-cta",
          ".hero .hero-attrib",
        ].filter((s) => document.querySelector(s));
        if (heroBits.length) {
          const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
          tl.fromTo(
            heroBits,
            { y: 26, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.85, stagger: 0.11 },
          );
          const vid = document.querySelector(".hero .hero-video");
          if (vid) {
            tl.fromTo(
              vid,
              { scale: 1.045, opacity: 0 },
              { scale: 1, opacity: 1, duration: 1.15, ease: "power2.out" },
              0.25,
            );
          }
        }

        // ── 2) Scroll reveals — every section after the hero ──────────
        document
          .querySelectorAll<HTMLElement>(
            "section.fscan, section.thesis, section.out, section.timeline, section.ai-sec, section.prod, section.sci-tease, section.test, section.advisors, section.wait, section.final",
          )
          .forEach((sec) => {
            gsap.fromTo(
              sec,
              { y: 44, opacity: 0 },
              {
                y: 0,
                opacity: 1,
                duration: 0.9,
                ease: "power3.out",
                scrollTrigger: { trigger: sec, start: "top 86%", once: true },
              },
            );
          });

        // Card grids stagger in a touch after their section.
        [".thesis-stat", ".ai-stat", ".doc", ".tl-cell"].forEach((sel) => {
          const items = gsap.utils.toArray<HTMLElement>(sel);
          if (items.length < 2) return;
          gsap.fromTo(
            items,
            { y: 26, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.7,
              ease: "power2.out",
              stagger: 0.09,
              scrollTrigger: { trigger: items[0], start: "top 88%", once: true },
            },
          );
        });

        // ── 3) Stat count-ups (leading number, suffix preserved) ──────
        document
          .querySelectorAll<HTMLElement>(".thesis-stat b, .ai-stat-n em")
          .forEach((el) => {
            const raw = el.textContent ?? "";
            const m = raw.match(/^([0-9,.]+)(.*)$/);
            if (!m) return;
            const target = parseFloat(m[1].replace(/,/g, ""));
            if (!isFinite(target) || target <= 0) return;
            const suffix = m[2] ?? "";
            const state = { n: 0 };
            gsap.to(state, {
              n: target,
              duration: 1.4,
              ease: "power2.out",
              scrollTrigger: { trigger: el, start: "top 90%", once: true },
              onUpdate: () => {
                el.textContent = `${Math.round(state.n).toLocaleString("ko-KR")}${suffix}`;
              },
            });
          });

        // ── 4) Subtle hero parallax (scrub) ───────────────────────────
        const heroR = document.querySelector(".hero .hero-r");
        if (heroR) {
          gsap.to(heroR, {
            y: -34,
            ease: "none",
            scrollTrigger: {
              trigger: ".hero",
              start: "top top",
              end: "bottom top",
              scrub: 0.6,
            },
          });
        }
      });

      cleanups.push(() => ctx.revert());

      // ── 5) 3D face scan (Three.js + MediaPipe canonical mesh) ───────
      const stage = document.getElementById("fscan-stage");
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

        // Points (vertex-colored so the scan band can sweep through them).
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

        // Wireframe edges — quiet rose, low opacity.
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

        // Pointer tilt (desktop) — small, so it reads as depth not gimmick.
        let px = 0;
        let py = 0;
        const onMove = (e: PointerEvent) => {
          px = e.clientX / window.innerWidth - 0.5;
          py = e.clientY / window.innerHeight - 0.5;
        };
        window.addEventListener("pointermove", onMove, { passive: true });

        // Scroll adds yaw across the section (the "왔다갔다").
        let scrollRot = 0;
        const rotST = ScrollTrigger.create({
          trigger: ".fscan",
          start: "top bottom",
          end: "bottom top",
          scrub: 0.5,
          onUpdate: (self) => {
            scrollRot = (self.progress - 0.5) * 1.15;
          },
        });

        // Metric bars fill when the section arrives.
        document.querySelectorAll<HTMLElement>(".fm-fill").forEach((f) => {
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

        const tags = [...stage.querySelectorAll<HTMLElement>(".fscan-tag")].map((el) => ({
          el,
          i: parseInt(el.dataset.anchor ?? "0", 10),
        }));
        const scanEl = stage.querySelector<HTMLElement>(".fscan-scanline");
        const v3 = new THREE.Vector3();
        const YMAX = 9;

        // Render only while the section is near the viewport.
        let raf = 0;
        let running = false;
        const clock = new THREE.Clock();
        const render = () => {
          raf = requestAnimationFrame(render);
          const t = clock.getElapsedTime();
          const ramp = Math.min(t / 1.6, 1); // global ease-in after first frame
          group.rotation.y = Math.sin(t * 0.3) * 0.42 + px * 0.38 + scrollRot;
          group.rotation.x = Math.sin(t * 0.19) * 0.07 + py * 0.2;

          // Scan band sweeps vertically through the point colors.
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

          // Project HUD tags onto their anchor vertices; fade when facing away.
          // Clamped inside the stage so labels never spill over neighboring UI.
          const clamp = (x: number, lo: number, hi: number) =>
            Math.min(Math.max(x, lo), hi);
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
          trigger: ".fscan",
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
