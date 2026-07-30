import type { MetadataRoute } from "next";

const BASE = "https://glo-us.com";

/**
 * /sitemap.xml — 공개 마케팅 페이지만 싣는다.
 * /refund 는 임시 비공개(404) 상태라 제외 — 공개 복구 시 함께 추가할 것.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${BASE}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/product`, lastModified, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/science`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/about`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/terms`, lastModified, changeFrequency: "yearly", priority: 0.2 },
  ];
}
