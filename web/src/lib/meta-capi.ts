import crypto from "crypto";

// Meta Conversions API (server-side). Sends Purchase events directly to Meta,
// deduplicated against the browser pixel via a shared `event_id`.
// No-ops unless both the pixel id and a CAPI access token are configured.

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
const TEST_CODE = process.env.META_TEST_EVENT_CODE; // optional, for Events Manager testing
const GRAPH_VERSION = "v21.0";

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s).digest("hex");

/** Normalize a KR phone to E.164 digits (drop leading 0 → 82) for hashing. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "82" + digits.slice(1);
  return digits;
}

export type PurchaseEvent = {
  eventId: string;
  value: number;
  currency: string;
  email?: string | null;
  phone?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  sourceUrl?: string | null;
};

/** Send a Purchase event to Meta CAPI. Best-effort; never throws to the caller. */
export async function sendMetaPurchase(ev: PurchaseEvent): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return;

  const user_data: Record<string, unknown> = {};
  if (ev.email) user_data.em = [sha256(ev.email.trim().toLowerCase())];
  if (ev.phone) {
    const n = normalizePhone(ev.phone);
    if (n) user_data.ph = [sha256(n)];
  }
  if (ev.fbp) user_data.fbp = ev.fbp;
  if (ev.fbc) user_data.fbc = ev.fbc;
  if (ev.clientIp) user_data.client_ip_address = ev.clientIp;
  if (ev.userAgent) user_data.client_user_agent = ev.userAgent;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        action_source: "website",
        ...(ev.sourceUrl ? { event_source_url: ev.sourceUrl } : {}),
        user_data,
        custom_data: {
          currency: ev.currency,
          value: ev.value,
          content_ids: ["GL-01"],
          content_type: "product",
        },
      },
    ],
  };
  if (TEST_CODE) body.test_event_code = TEST_CODE;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const t = await res.text();
      console.error("[meta-capi] Purchase failed:", res.status, t);
    }
  } catch (e) {
    console.error("[meta-capi] Purchase error:", e);
  }
}
