import { getCarrier } from "./carriers";

/**
 * 스마트택배(Sweet Tracker) 배송 조회.
 * 배송완료 여부를 확인해 주문 상태를 자동으로 '배송완료'로 올리는 데 쓴다.
 *
 * 환경변수: SWEETTRACKER_API_KEY (web/.env.local — 커밋 금지)
 */

const API = "http://info.sweettracker.co.kr/api/v1/trackingInfo";

export type TrackingStatus = {
  /** 조회 성공 여부 (송장 미등록·오류면 false) */
  found: boolean;
  /** 배송완료 */
  delivered: boolean;
  /** 1 배송준비 · 2 집화완료 · 3 배송중 · 4 지점도착 · 5 배송출발 · 6 배송완료 */
  level?: number;
  /** 배송완료 시각 (마지막 level 6 이벤트) */
  deliveredAt?: Date;
  error?: string;
};

type ApiResponse = {
  status?: boolean;
  result?: string;
  complete?: boolean;
  level?: number;
  msg?: string;
  trackingDetails?: Array<{ level?: number; time?: number; timeString?: string }>;
};

/** 송장 1건 조회. 네트워크·응답 오류는 예외 대신 found:false로 돌려준다. */
export async function fetchTracking(
  carrierCode: string | null,
  invoice: string,
): Promise<TrackingStatus> {
  const key = process.env.SWEETTRACKER_API_KEY;
  if (!key) return { found: false, delivered: false, error: "SWEETTRACKER_API_KEY 미설정" };

  const carrier = getCarrier(carrierCode);
  if (!carrier) return { found: false, delivered: false, error: `알 수 없는 택배사: ${carrierCode}` };

  const n = invoice.replace(/\D/g, "");
  if (!n) return { found: false, delivered: false, error: "송장번호 형식 오류" };

  const url = `${API}?t_key=${encodeURIComponent(key)}&t_code=${carrier.smartCode}&t_invoice=${n}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { found: false, delivered: false, error: `HTTP ${res.status}` };
    const j = (await res.json()) as ApiResponse;

    // 조회 실패 시 result가 "N"이거나 status가 false로 온다.
    if (j.result === "N" || j.status === false) {
      return { found: false, delivered: false, error: j.msg ?? "조회 결과 없음" };
    }

    const delivered = j.complete === true || j.level === 6;
    let deliveredAt: Date | undefined;
    if (delivered) {
      const last = j.trackingDetails?.filter((d) => d.level === 6).pop();
      if (last?.time) deliveredAt = new Date(last.time);
    }
    return { found: true, delivered, level: j.level, deliveredAt };
  } catch (e) {
    return {
      found: false,
      delivered: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
