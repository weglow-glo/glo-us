import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT } from "@/lib/product";
import { getPointPolicy } from "@/lib/points";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "리뷰 작성 — glo",
  robots: { index: false, follow: false },
};

const EDIT_WINDOW_MS = 24 * 3600 * 1000;

/** 배송완료된 본인 주문의 리뷰 작성/수정 (24시간 이내, 검수 완료 전). */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId: raw } = await params;
  const orderId = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/account/review/${orderId}`);

  // RLS로 본인 주문만 조회된다.
  const { data: order } = await supabase
    .from("orders")
    .select("order_id, order_name, status, delivered_at")
    .eq("order_id", orderId)
    .maybeSingle<{
      order_id: string;
      order_name: string;
      status: string;
      delivered_at: string | null;
    }>();
  if (!order) notFound();

  const admin = createAdminClient();
  const policy = await getPointPolicy(admin);
  const fmtP = (n: number) => n.toLocaleString("ko-KR");
  const { data: existing } = await admin
    .from("reviews")
    .select("id, user_id, rating, body, status, media_status, created_at")
    .eq("order_id", orderId)
    .eq("product_code", PRODUCT.code)
    .maybeSingle<{
      id: string;
      user_id: string | null;
      rating: number;
      body: string;
      status: string;
      media_status: string;
      created_at: string;
    }>();

  const editable =
    existing &&
    existing.status === "approved" &&
    existing.user_id === user.id &&
    !["approved", "rejected"].includes(existing.media_status) &&
    Date.now() - Date.parse(existing.created_at) <= EDIT_WINDOW_MS;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <Link href="/account" className="text-sm text-ink-mute hover:text-ink">
        ← 마이페이지
      </Link>
      <h1 className="mt-4 font-sans text-2xl font-light text-ink">
        {existing ? (editable ? "리뷰 수정" : "내 리뷰") : "리뷰 작성"}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">{order.order_name}</p>

      {existing ? (
        editable ? (
          <>
            <div className="mt-5 rounded-xl border border-ink-line bg-bg-2 px-5 py-4 text-xs leading-relaxed text-ink-soft">
              작성 후 <b className="text-ink">24시간 이내</b>에는 별점과 내용을 수정할 수
              있습니다. 첨부한 사진·영상은 교체할 수 없고, 검수가 완료되면 수정할 수
              없습니다.
              {existing.media_status === "pending" && " 첨부 미디어는 검수 중입니다."}
            </div>
            <ReviewForm
              orderId={order.order_id}
              edit={{ reviewId: existing.id, rating: existing.rating, body: existing.body }}
            />
          </>
        ) : (
          <div className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-6 text-sm leading-relaxed text-ink-soft">
            {existing.status === "hidden" ? (
              <>이 주문의 리뷰는 운영 정책에 따라 <b className="text-ink">게시가 중단</b>되었습니다. 문의는 채널톡으로 부탁드립니다.</>
            ) : (
            <>이 주문의 리뷰는 <b className="text-ink">게시 완료</b>되었습니다.</>
            )}
            {existing.media_status === "pending" &&
              ` 첨부하신 사진·영상은 검수 중이며, 승인되면 공개되고 ${fmtP(policy.review_media)}P가 추가 적립됩니다.`}{" "}
            {existing.media_status === "approved" || existing.media_status === "rejected"
              ? " 검수가 완료된 리뷰는 수정할 수 없습니다."
              : " 수정 기한(24시간)이 지나 내용은 변경할 수 없습니다."}{" "}
            삭제가 필요하면 채널톡으로 문의해주세요.
          </div>
        )
      ) : order.status !== "delivered" ? (
        <div className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-6 text-sm text-ink-soft">
          배송완료된 주문만 리뷰를 작성할 수 있습니다.
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-xl border border-burg-50 bg-bg-3 px-5 py-4 text-xs leading-relaxed text-ink-soft">
            리뷰를 게시하면 <b className="text-accent">{fmtP(policy.review_text)}P</b>가 바로
            적립되고, 사진·영상이 검수를 통과하면{" "}
            <b className="text-accent">{fmtP(policy.review_media)}P</b>가 추가 적립됩니다.
            포인트는 다음 구매 시 사용할 수 있습니다.
          </div>
          <ReviewForm orderId={order.order_id} textPoint={policy.review_text} mediaPoint={policy.review_media} />
        </>
      )}
    </main>
  );
}
