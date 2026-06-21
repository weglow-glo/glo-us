"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { META_PIXEL_ID, metaTrack } from "@/lib/meta";

let scriptInjected = false;
function injectPixel() {
  if (scriptInjected || typeof window === "undefined") return;
  scriptInjected = true;
  /* Standard Meta Pixel bootstrap (queues calls until fbevents.js loads). */
  /* eslint-disable */
  // @ts-nocheck
  (function (f: any, b: any, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
}

/**
 * Meta Pixel — loaded site-wide except /admin. Fires PageView on every route
 * and ViewContent on the product page. No-ops until NEXT_PUBLIC_META_PIXEL_ID
 * is set. Purchase/InitiateCheckout are fired from their own pages.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const onAdmin = pathname?.startsWith("/admin") ?? false;
  const initedRef = useRef(false);

  useEffect(() => {
    if (!META_PIXEL_ID || onAdmin) return;
    if (!initedRef.current) {
      injectPixel();
      window.fbq?.("init", META_PIXEL_ID);
      initedRef.current = true;
    }
    metaTrack("PageView");
    if (pathname?.startsWith("/product")) {
      metaTrack("ViewContent", {
        content_ids: ["GL-01"],
        content_type: "product",
        content_name: "glo GL-01",
      });
    }
  }, [pathname, onAdmin]);

  return null;
}
