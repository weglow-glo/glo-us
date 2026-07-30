import { createAdminClient } from "@/lib/supabase/admin";
import { pullInvoicesFromWms } from "@/lib/ebut";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 송장 회수 자동화 — WMS에 발주된 주문의 송장번호가 나오면 배송중 전환
 * + 알림톡 발송까지 처리한다 (기존: WMS에서 송장 받아 관리자 수기 입력).
 *
 * 주의: Vercel IP가 이벗 화이트리스트에 없어 여기서 실행하면 HTTP 401.
 * 실제 스케줄은 사무실 PC 러너(scripts/wms-runner.ts, 작업 스케줄러
 * glo-wms-pull 매시 30분)가 담당한다. 이 라우트는 IP 제한이 풀릴
 * 경우를 대비해 남겨둔다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await pullInvoicesFromWms(createAdminClient());
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
