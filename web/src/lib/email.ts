import { Resend } from "resend";
import { formatKRW } from "@/lib/product";

/**
 * Order confirmation email. SERVER ONLY.
 * Sending is best-effort — a failure here must never roll back a confirmed
 * payment, so callers should not await-throw on it (see confirm route).
 */

const FROM = process.env.EMAIL_FROM ?? "glo <onboarding@resend.dev>";

export type OrderEmailData = {
  to: string;
  orderId: string;
  orderName: string;
  amount: number;
  customerName?: string | null;
  approvedAt?: string | null;
};

export async function sendOrderConfirmation(data: OrderEmailData) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping confirmation email");
    return { skipped: true as const };
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM,
    to: data.to,
    subject: `[glo] 주문이 확인되었습니다 · ${data.orderName}`,
    html: orderConfirmationHtml(data),
  });

  if (error) {
    console.error("[email] send failed:", error);
    return { error };
  }
  return { ok: true as const };
}

function orderConfirmationHtml(d: OrderEmailData): string {
  const name = d.customerName ? `${d.customerName}님, ` : "";
  const when = d.approvedAt
    ? new Date(d.approvedAt).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      })
    : "";

  return `
  <div style="margin:0;padding:40px 0;background:#faf7f7;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#2a1218;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(42,18,24,0.08);border-radius:16px;overflow:hidden;">
      <div style="padding:36px 40px 28px;">
        <div style="font-family:Georgia,serif;font-size:30px;font-weight:300;letter-spacing:-1px;">glo<span style="color:#8a4a52;font-style:italic;">.</span></div>
        <h1 style="font-family:Georgia,serif;font-weight:300;font-size:24px;margin:28px 0 8px;">주문이 확인되었습니다.</h1>
        <p style="font-size:14px;line-height:1.6;color:rgba(42,18,24,0.68);margin:0;">
          ${name}결제가 정상적으로 완료되었습니다. 정성껏 준비해 보내드리겠습니다.
        </p>
      </div>

      <div style="margin:0 40px;border-top:1px solid rgba(42,18,24,0.08);"></div>

      <div style="padding:24px 40px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr>
            <td style="padding:6px 0;color:rgba(42,18,24,0.68);">주문번호</td>
            <td style="padding:6px 0;text-align:right;">${d.orderId}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:rgba(42,18,24,0.68);">상품</td>
            <td style="padding:6px 0;text-align:right;">${d.orderName}</td>
          </tr>
          ${
            when
              ? `<tr><td style="padding:6px 0;color:rgba(42,18,24,0.68);">결제일시</td><td style="padding:6px 0;text-align:right;">${when}</td></tr>`
              : ""
          }
          <tr>
            <td style="padding:14px 0 0;color:rgba(42,18,24,0.68);border-top:1px solid rgba(42,18,24,0.08);font-weight:600;">결제금액</td>
            <td style="padding:14px 0 0;text-align:right;border-top:1px solid rgba(42,18,24,0.08);font-family:Georgia,serif;font-size:18px;">${formatKRW(
              d.amount,
            )}</td>
          </tr>
        </table>
      </div>

      <div style="padding:24px 40px 36px;background:#faf7f7;">
        <p style="font-family:Georgia,serif;font-style:italic;font-size:15px;color:#8a4a52;margin:0 0 6px;">A quieter kind of glow.</p>
        <p style="font-size:12px;line-height:1.7;color:rgba(42,18,24,0.5);margin:0;">
          문의: official@weglow.biz · 메디랩스<br/>
          본 메일은 발신전용입니다.
        </p>
      </div>
    </div>
  </div>`;
}
