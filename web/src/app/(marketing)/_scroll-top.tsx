"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Floating "scroll to top" button, bottom-right. Appears after scrolling down.
 * Sits above the product page's mobile buy bar (.buy-float) so they don't overlap.
 * Only rendered on marketing pages (commerce routes are outside this group).
 */
export default function ScrollTop() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [bottom, setBottom] = useState(24);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const calc = () => {
      const bar = document.querySelector(".buy-float");
      const barVisible = !!bar && getComputedStyle(bar).display !== "none";
      setBottom(barVisible ? 88 : 24);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [pathname]);

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed",
        right: 20,
        bottom,
        zIndex: 55,
        width: 44,
        height: 44,
        borderRadius: "50%",
        border: "1px solid rgba(42,18,24,0.12)",
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        color: "#2a1218",
        boxShadow: "0 6px 20px rgba(58,26,34,0.18)",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
        opacity: show ? 1 : 0,
        pointerEvents: show ? "auto" : "none",
        transition: "opacity .2s, bottom .2s",
      }}
    >
      ↑
    </button>
  );
}
