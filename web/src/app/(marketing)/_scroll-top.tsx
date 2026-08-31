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
    // 자체 CS 위젯(cs-widget.tsx)이 켜져 있으면 같은 코너를 쓰므로 그 위로 스택.
    const csOffset = process.env.NEXT_PUBLIC_CS_WIDGET === "1" ? 68 : 0;
    const calc = () => {
      const bar = document.querySelector(".buy-float");
      const barVisible = !!bar && getComputedStyle(bar).display !== "none";
      setBottom((barVisible ? 88 : 24) + csOffset);
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
        // bottom은 transition 대상에서 제외 — reduced-motion의 0.01ms 오버라이드와
        // 얽히면 렌더 프레임이 없는 탭에서 시작값에 고착되는 사례가 있었다.
        transition: "opacity .2s",
      }}
    >
      ↑
    </button>
  );
}
