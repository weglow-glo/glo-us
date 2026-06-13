import type { NextConfig } from "next";

// Legacy static-site URLs (root English *.html and Korean /ko/*.html) → new
// clean Next routes. Keeps existing links / search-indexed pages alive after
// the glo-us.com cutover from the static site to this app.
const PAGES = [
  ["index", "/"],
  ["product", "/product"],
  ["science", "/science"],
  ["about", "/about"],
  ["privacy", "/privacy"],
  ["terms", "/terms"],
  ["refund", "/refund"],
  ["login", "/login"],
  ["account", "/account"],
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    const r: Array<{ source: string; destination: string; permanent: boolean }> = [
      { source: "/ko", destination: "/", permanent: true },
    ];
    for (const [name, dest] of PAGES) {
      r.push({ source: `/${name}.html`, destination: dest, permanent: true });
      r.push({ source: `/ko/${name}.html`, destination: dest, permanent: true });
    }
    return r;
  },
};

export default nextConfig;
