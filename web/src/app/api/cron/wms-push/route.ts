import { createAdminClient } from "@/lib/supabase/admin";
import { pushOrdersToWms } from "@/lib/ebut";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 매일 아침 발주 자동화 — 결제완료 주문을 이벗WMS 오픈DB에 등록하고
 * 배송준비중으로 전환한다 (기존: 수동 상태 전환 + 발주 엑셀 업로드).
 * vercel.json: 02:00 UTC = 11:00 KST.
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
