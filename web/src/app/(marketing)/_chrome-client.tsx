"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Behaviors for the shared marketing chrome (nav + footer live in the layout):
 *  - intercept internal <a> clicks → client-side navigation so the nav/footer
 *    stay mounted (no full reload) between marketing pages
 *  - mark the active top-nav link based on the current path
 */
export default function ChromeBehaviors() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Client-nav only WITHIN the marketing group. Commerce routes (checkout,
    // login, account, admin) full-load so the marketing global CSS doesn't
    // leak onto their Tailwind layout.
    const MARKETING = new Set([
      "/", "/product", "/science", "/about", "/privacy", "/terms", "/refund",
    ]);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || a.getAttribute("target") === "_blank") return;
      if (!href.startsWith("/")) return; // external, mailto:, tel:, #hash
      const url = new URL(href, location.origin);
      if (!MARKETING.has(url.pathname)) return; // commerce/other → full load
      e.preventDefault();
      router.push(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

  // Mobile nav: the hamburger toggles the links dropdown (< 640px). Closes on
  // outside click, Escape, and on route change (the effect re-runs).
  useEffect(() => {
    const burger = document.querySelector<HTMLButtonElement>(".nav-burger");
    const menu = document.querySelector<HTMLElement>(".nav-links");
    if (!burger || !menu) return;

    const close = () => {
      menu.classList.remove("is-open");
      burger.setAttribute("aria-expanded", "false");
    };
    close(); // also collapses the menu after a client-side navigation

    const onBurger = (e: MouseEvent) => {
      e.stopPropagation();
      const open = menu.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", String(open));
    };
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.contains(t) && !burger.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    burger.addEventListener("click", onBurger);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      burger.removeEventListener("click", onBurger);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pathname]);

  // Scroll-reveal for the about-page timeline rows. JS adds the hidden class so
  // no-JS visitors still see everything; reduced-motion skips the effect.
  useEffect(() => {
    const rows = [...document.querySelectorAll<HTMLElement>(".tl-row")];
    if (!rows.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    rows.forEach((r) => r.classList.add("tl-reveal"));
    let raf = 0;
    const reveal = () => {
      raf = 0;
      const line = window.innerHeight * 0.88;
      let remaining = false;
      rows.forEach((r) => {
        if (r.classList.contains("tl-in")) return;
        if (r.getBoundingClientRect().top < line) r.classList.add("tl-in");
        else remaining = true;
      });
      if (!remaining) window.removeEventListener("scroll", onScroll);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(reveal);
    };
    reveal(); // reveal whatever is already above the fold on load
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(".nav-links a");
    links.forEach((a) => {
      const href = a.getAttribute("href") || "";
      const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }, [pathname]);

  return null;
}
