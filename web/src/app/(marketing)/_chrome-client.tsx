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
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || a.getAttribute("target") === "_blank") return;
      // Only internal path links — leaves #anchors, mailto:, tel:, external alone.
      if (!href.startsWith("/")) return;
      e.preventDefault();
      router.push(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

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
