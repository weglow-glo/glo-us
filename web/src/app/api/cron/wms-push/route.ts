import { createAdminClient } from "@/lib/supabase/admin";
import { pushOrdersToWms } from "@/lib/ebut";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 발주 자동화 — 결제완료 주문을 이벗WMS 오픈DB에 등록하고
 * 배송준비중으로 전환한다 (기존: 수동 상태 전환 + 발주 엑셀 업로드).
 *
 * 주의: Vercel IP가 이벗 화이트리스트에 없어 여기서 실행하면 HTTP 401.
 * 실제 스케줄은 사무실 PC 러너(scripts/wms-runner.ts, 작업 스케줄러
 * glo-wms-push 매일 11:00 KST)가 담당한다. 이 라우트는 IP 제한이
 * 풀릴 경우를 대비해 남겨둔다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await pushOrdersToWms(createAdminClient());
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
