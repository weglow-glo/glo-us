"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { GA_ID, gaPageView, gaViewItem } from "@/lib/ga";

/**
 * GA4 로더 — 루트 레이아웃에 1회 마운트. /admin 은 제외한다
 * (운영자 트래픽이 방문 통계를 오염시키지 않도록).
 *
 * send_page_view:false 로 자동 페이지뷰를 끄고 라우트 전환마다 수동
 * 발화한다 — Next.js 클라이언트 내비게이션에서 자동 수집은 첫 진입만
 * 잡히기 때문. 상세페이지에서는 view_item 도 함께 보낸다.
 */
export default function GoogleAnalytics() {
  const pathname = usePathname();
  const onAdmin = pathname?.startsWith("/admin") ?? false;
  const firstRef = useRef(true);

  useEffect(() => {
    if (!GA_ID || onAdmin) return;
    // 최초 1회는 gtag config 가 대신 보내므로 중복 발화하지 않는다
    if (firstRef.current) {
      firstRef.current = false;
    } else {
      gaPageView(pathname ?? "/");
    }
    if (pathname === "/product" || pathname?.startsWith("/product/")) {
      gaViewItem(99960);
    }
  }, [pathname, onAdmin]);

  if (!GA_ID || onAdmin) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA_ID}',{send_page_view:true});`}
      </Script>
    </>
  );
}
