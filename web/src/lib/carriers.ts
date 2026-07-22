/**
 * 국내 택배사 목록과 배송조회 링크.
 * 코드값은 DB(orders.carrier)에 저장되므로 바꾸지 말 것.
 */

export type Carrier = {
  code: string;
  name: string;
  /** 송장번호를 넣으면 조회 페이지 URL이 된다 */
  trackingUrl: (n: string) => string;
};

export const CARRIERS: Carrier[] = [
  {
    code: "cj",
    name: "CJ대한통운",
    trackingUrl: (n) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}`,
  },
  {
    code: "hanjin",
    name: "한진택배",
    trackingUrl: (n) =>
      `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}`,
  },
  {
    code: "lotte",
    name: "롯데택배",
    trackingUrl: (n) =>
      `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}`,
  },
  {
    code: "post",
    name: "우체국택배",
    trackingUrl: (n) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`,
  },
  {
    code: "logen",
    name: "로젠택배",
    trackingUrl: (n) => `https://www.ilogen.com/web/personal/trace/${n}`,
  },
  {
    code: "kyungdong",
    name: "경동택배",
    trackingUrl: (n) =>
      `https://kdexp.com/basicNewDelivery.kd?barcode=${n}`,
  },
];

export function getCarrier(code: string | null | undefined): Carrier | null {
  return CARRIERS.find((c) => c.code === code) ?? null;
}

export function carrierName(code: string | null | undefined): string {
  return getCarrier(code)?.name ?? "택배";
}

export function trackingUrlOf(
  code: string | null | undefined,
  trackingNumber: string,
): string | null {
  const c = getCarrier(code);
  return c ? c.trackingUrl(trackingNumber.replace(/\D/g, "")) : null;
}
