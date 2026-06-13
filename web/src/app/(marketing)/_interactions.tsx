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

    // (Buy-option subscribe/one-time toggle removed — phase-1 is a single
    // one-time purchase at ₩59,500; the buy button links straight to /checkout.)

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
