import type { MetadataRoute } from "next";

/**
 * /robots.txt — 마케팅 페이지만 크롤링 허용.
 * 커머스·개인화 경로(체크아웃/계정/관리자/배송조회/API)는 색인 대상이 아니다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          "/checkout",
          "/account",
          "/login",
          "/track/",
          "/auth/",
        ],
      },
    ],
    sitemap: "https://www.glo-us.com/sitemap.xml",
  };
}
