/**
 * Sync the repo-root `assets/` into `web/public/assets/` so Next can serve
 * them. Root assets/ is the single source of truth (shared with the legacy
 * static site); the copy under web/public is generated and gitignored.
 *
 * Runs automatically via the `predev` / `prebuild` npm hooks — including on
 * Vercel, where the whole repo is checked out and the build root is web/.
 *
 * Manual recursion (readdir + copyFile) — fs.cpSync stack-overflows on some
 * Node/Windows builds. Large *-orig.mp4 backups are skipped.
 */
import {
  readdirSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "..", "assets"); // <repo>/assets
const DEST = join(here, "..", "public", "assets"); // web/public/assets

const skip = (name) => /-orig\.mp4$/.test(name);

let files = 0;
function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else if (entry.isFile()) {
      // Skip rewrite if up-to-date (faster repeat dev starts).
      if (existsSync(d) && statSync(d).mtimeMs >= statSync(s).mtimeMs) continue;
      copyFileSync(s, d);
      files++;
    }
  }
}

if (!existsSync(SRC)) {
  console.warn(`[copy-assets] source not found, skipping: ${SRC}`);
  process.exit(0);
}

copyDir(SRC, DEST);
console.log(`[copy-assets] synced repo assets/ → web/public/assets (${files} updated)`);
