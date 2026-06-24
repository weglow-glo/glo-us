import crypto from "crypto";

// Meta Conversions API (server-side). Sends events directly to Meta,
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

/** Customer-matching signals shared by every event. Hashed fields are SHA-256'd. */
export type Identity = {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null; // stable user id — improves match quality
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
};

function buildUserData(id: Identity): Record<string, unknown> {
  const u: Record<string, unknown> = {};
  if (id.email) u.em = [sha256(id.email.trim().toLowerCase())];
  if (id.phone) {
    const n = normalizePhone(id.phone);
    if (n) u.ph = [sha256(n)];
  }
  if (id.externalId) u.external_id = [sha256(String(id.externalId).trim().toLowerCase())];
  if (id.fbp) u.fbp = id.fbp;
  if (id.fbc) u.fbc = id.fbc;
  if (id.clientIp) u.client_ip_address = id.clientIp;
  if (id.userAgent) u.client_user_agent = id.userAgent;
  return u;
}

/** POST a single event to the Graph API. Best-effort; never throws to the caller. */
async function postEvent(
  event: Record<string, unknown>,
  label: string,
): Promise<void> {
  if (!PIXEL_ID || !ACCESS_TOKEN) return;
  const body: Record<string, unknown> = { data: [event] };
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
      console.error(`[meta-capi] ${label} failed:`, res.status, t);
    }
  } catch (e) {
    console.error(`[meta-capi] ${label} error:`, e);
  }
}

export type PurchaseEvent = Identity & {
  eventId: string;
  value: number;
  currency: string;
  sourceUrl?: string | null;
};

/** Send a Purchase event to Meta CAPI. */
export async function sendMetaPurchase(ev: PurchaseEvent): Promise<void> {
  await postEvent(
    {
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: ev.eventId,
      action_source: "website",
      ...(ev.sourceUrl ? { event_source_url: ev.sourceUrl } : {}),
      user_data: buildUserData(ev),
      custom_data: {
        currency: ev.currency,
        value: ev.value,
        content_ids: ["GL-01"],
        content_type: "product",
      },
    },
    "Purchase",
  );
}

export type RegistrationEvent = Identity & {
  eventId: string;
  sourceUrl?: string | null;
};

/** Send a CompleteRegistration event to Meta CAPI (fired on a new signup). */
export async function sendMetaRegistration(ev: RegistrationEvent): Promise<void> {
  await postEvent(
    {
      event_name: "CompleteRegistration",
      event_time: Math.floor(Date.now() / 1000),
      event_id: ev.eventId,
      action_source: "website",
      ...(ev.sourceUrl ? { event_source_url: ev.sourceUrl } : {}),
      user_data: buildUserData(ev),
      custom_data: { content_name: "kakao_signup", status: true },
    },
    "CompleteRegistration",
  );
}
