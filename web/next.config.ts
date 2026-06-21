import type { NextConfig } from "next";
import {
  readdirSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

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

// Copy repo-root assets/ → web/public/assets/ during build.
// This runs before Next.js build starts, ensuring assets are available
// even if npm prebuild hook doesn't run (e.g., some Vercel configurations).
function copyAssets() {
  const SRC = join(__dirname, "..", "assets");
  const DEST = join(__dirname, "public", "assets");
  const skip = (name: string) => /-orig\.mp4$/.test(name);

  let files = 0;
  function copyDir(src: string, dest: string) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (skip(entry.name)) continue;
      const s = join(src, entry.name);
      const d = join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDir(s, d);
      } else if (entry.isFile()) {
        if (existsSync(d) && statSync(d).mtimeMs >= statSync(s).mtimeMs) continue;
        copyFileSync(s, d);
        files++;
      }
    }
  }

  if (!existsSync(SRC)) {
    console.warn(`[next.config] assets source not found, skipping: ${SRC}`);
    return;
  }

  copyDir(SRC, DEST);
  console.log(`[next.config] synced assets/ → public/assets (${files} updated)`);
}

// Run asset copy immediately when config is loaded
copyAssets();

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
