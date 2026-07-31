"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { NAVER_CTS_ID, naverPV, naverConv } from "@/lib/naver-cts";

/**
 * 네이버 전환추적 로더 — 루트 레이아웃에 1회 마운트.
 * wcslog.js 를 싣고, 라우트 전환마다 PV 를 재발화한다 (SPA 대응).
 * /product 진입 시 상품상세(view_product) 전환도 함께 전송한다.
 */
export default function NaverCts() {
  const pathname = usePathname();
  const loadedRef = useRef(false);

  const fire = (path: string) => {
    naverPV();
    if (path === "/product") {
      naverConv({
        type: "view_product",
        items: [{ id: "GL-01", name: "glo GL-01", category: "이너뷰티" }],
      });
    }
  };

  useEffect(() => {
    if (loadedRef.current) fire(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!NAVER_CTS_ID) return null;

  return (
    <Script
      src="https://wcs.naver.net/wcslog.js"
      strategy="afterInteractive"
      onLoad={() => {
        loadedRef.current = true;
        fire(window.location.pathname);
      }}
    />
  );
}
