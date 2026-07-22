import { createAdminClient } from "@/lib/supabase/admin";
import { carrierName, trackingUrlOf } from "@/lib/carriers";
import { PRODUCT } from "@/lib/product";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "배송 조회 — glo",
  robots: { index: false, follow: false },
};

/**
 * 알림톡/문자의 배송조회 링크가 향하는 페이지.
 * 링크 도메인을 glo-us.com으로 고정하기 위한 중계 페이지이므로, 택배사가 바뀌어도
 * 알림톡 템플릿을 다시 심사받을 필요가 없다.
 *
 * 주문번호만 알면 열리는 페이지라 개인정보는 노출하지 않는다.
 * (이름·연락처·주소 제외, 배송 조회에 필요한 값만 보여준다)
 */
export default async function TrackPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("order_id, status, carrier, tracking_number, quantity, shipped_at")
    .eq("order_id", decodeURIComponent(orderId))
    .maybeSingle<{
      order_id: string;
      status: string;
      carrier: string | null;
      tracking_number: string | null;
      quantity: number | null;
      shipped_at: string | null;
    }>();

  const url =
    data?.tracking_number && trackingUrlOf(data.carrier, data.tracking_number);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      {/* 본 사이트 로고와 동일하게 — Fraunces 300 + 이탤릭 액센트 dot */}
      <div
        className="font-display text-[30px] font-light leading-none text-ink"
        style={{ letterSpacing: "-1.3px" }}
      >
        glo<span className="italic text-accent">.</span>
      </div>

      {!data ? (
        <div className="mt-8 rounded-2xl border border-ink-line bg-bg-2 p-8">
          <h1 className="text-lg font-semibold text-ink">주문을 찾을 수 없습니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            링크가 잘못되었거나 만료되었을 수 있습니다. 문의는 고객센터{" "}
            <a href="tel:02-467-1024" className="text-accent underline">
              02-467-1024
            </a>
            로 연락 주세요.
          </p>
        </div>
      ) : !data.tracking_number ? (
        <div className="mt-8 rounded-2xl border border-ink-line bg-bg-2 p-8">
          <h1 className="text-lg font-semibold text-ink">아직 배송 준비 중입니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            송장번호가 등록되면 문자로 다시 안내해 드립니다.
          </p>
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-ink-line bg-bg-2 p-8">
          <h1 className="text-lg font-semibold text-ink">배송 조회</h1>

          <dl className="mt-6 space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-mute">상품</dt>
              <dd className="text-right font-medium text-ink">
                {/* 마케팅 페이지의 .gloword와 동일하게 'glo'만 Fraunces로 */}
                <span className="font-display">glo</span> {PRODUCT.code}
                {data.quantity ? ` · ${data.quantity}박스` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-mute">택배사</dt>
              <dd className="text-right font-medium text-ink">
                {carrierName(data.carrier)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-mute">송장번호</dt>
              <dd className="text-right font-mono font-medium text-ink">
                {data.tracking_number}
              </dd>
            </div>
          </dl>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 block rounded-full bg-burg-600 px-6 py-3.5 text-center text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
            >
              {carrierName(data.carrier)}에서 조회하기 →
            </a>
          )}

          <p className="mt-5 text-center text-xs leading-relaxed text-ink-faint">
            택배사 시스템에 반영되기까지 몇 시간이 걸릴 수 있습니다.
            <br />
            문의{" "}
            <a href="tel:02-467-1024" className="underline">
              02-467-1024
            </a>
          </p>
        </div>
      )}
    </main>
  );
}
