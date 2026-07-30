/**
 * 이벗WMS 사무실 PC 러너 — Vercel IP가 이벗 화이트리스트에 막혀 있어
 * (게이트웨이가 미허가 IP를 HTTP 401로 거부) 크론을 사무실 PC에서 돌린다.
 * 서비스 코드(lib/ebut.ts)를 그대로 재사용하므로 로직 이중화가 없다.
 *
 * 사용법 (web/ 에서):
 *   npx tsx scripts/wms-runner.ts push   — 발주 전송 (작업 스케줄러: 매일 11:00)
 *   npx tsx scripts/wms-runner.ts pull   — 송장 회수 (작업 스케줄러: 매시 30분)
 *   npx tsx scripts/wms-runner.ts both   — 둘 다 (수동 즉시 실행용)
 *
 * 환경변수는 web/.env.local 에서 읽는다 (Next.js 와 동일한 소스).
 * 실패 시 exit 1 — 작업 스케줄러 기록에서 실패 이력을 볼 수 있다.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(webDir, ".env.local"), "utf-8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  if (!(k in process.env)) process.env[k] = t.slice(eq + 1).trim();
}

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin");
  const { pushOrdersToWms, pullInvoicesFromWms } = await import("../src/lib/ebut");

  const mode = process.argv[2];
  if (!["push", "pull", "both"].includes(mode ?? "")) {
    console.error("usage: tsx scripts/wms-runner.ts <push|pull|both>");
    process.exit(2);
  }

  const stamp = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
  const admin = createAdminClient();
  let failed = false;

  if (mode === "push" || mode === "both") {
    const r = await pushOrdersToWms(admin);
    console.log(`[${stamp()}] push ${JSON.stringify(r)}`);
    if (!r.ok) failed = true;
  }
  if (mode === "pull" || mode === "both") {
    const r = await pullInvoicesFromWms(admin);
    console.log(`[${stamp()}] pull ${JSON.stringify(r)}`);
    if (!r.ok) failed = true;
  }
  // process.exit() 는 tsx 의 워커 종료와 겹쳐 assertion 노이즈를 내므로
  // exitCode 로 자연 종료시킨다.
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
