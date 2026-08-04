import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 고객 셀프 배송지 변경 — 결제 후 오입력 CS 대응.
 *
 * WMS 발주 전(wms_pushed_at IS NULL)까지만 허용한다. 주소는 발주 시점에
 * WMS 로 넘어가므로 이 구간의 수정은 안전하다. 발주 후에는 창고 협의가
 * 필요해 고객센터로 안내한다 (주문 상세 UI가 같은 기준으로 버튼을 숨김).
 *
 * 소유 확인은 RLS(orders_select_own) 스코프 조회로, 갱신은 admin 클라이언트
 * 로 하되 조건(order_id + 미발주 상태)을 다시 걸어 경합을 방어한다.
 */
export async function PATCH(request: Request) {
  let body: {
    orderId?: string;
    recipient?: string;
    phone?: string;
    postcode?: string;
    address?: string;
    detail?: string;
    memo?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orderId = body.orderId?.trim();
  const recipient = body.recipient?.trim();
  const phone = body.phone?.replace(/\D/g, "");
  const postcode = body.postcode?.trim();
  const address = body.address?.trim();
  const detail = (body.detail ?? "").trim();
  const memo = (body.memo ?? "").trim();

  if (!orderId) return NextResponse.json({ error: "orderId는 필수입니다." }, { status: 400 });
  if (!recipient || !phone || !postcode || !address) {
    return NextResponse.json(
      { error: "수령인·연락처·우편번호·주소를 모두 입력해주세요." },
      { status: 400 },
    );
  }
  if (!/^01[0-9]{8,9}$/.test(phone)) {
    return NextResponse.json({ error: "휴대폰 번호 형식을 확인해주세요." }, { status: 400 });
  }
  if (recipient.length > 18 || address.length + detail.length > 120 || memo.length > 300) {
    return NextResponse.json({ error: "입력값이 너무 깁니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  // 소유 + 상태 확인 (RLS 로 본인 주문만 보인다)
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, wms_pushed_at, tracking_number")
    .eq("order_id", orderId)
    .single<{
      id: string;
      status: string;
      wms_pushed_at: string | null;
      tracking_number: string | null;
    }>();

  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });

  const editable =
    ["paid", "awaiting_deposit"].includes(order.status) &&
    !order.wms_pushed_at &&
    !order.tracking_number;
  if (!editable) {
    return NextResponse.json(
      { error: "배송 준비가 시작되어 직접 변경할 수 없어요. 고객센터로 문의해주세요." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("orders")
    .update({
      shipping_address: { recipient, phone, postcode, address, detail, memo },
      customer_phone: phone,
    })
    .eq("id", order.id)
    .is("wms_pushed_at", null) // 발주 경합 방어 — 그 사이 발주됐으면 무시
    .in("status", ["paid", "awaiting_deposit"]);

  if (error) {
    console.error("[orders/address]", error.message);
    return NextResponse.json({ error: "저장에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
