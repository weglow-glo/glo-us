/**
 * 공동구매 — 로컬 데모 데이터 (개발 전용).
 *
 * 직원용 .env.local 에는 SUPABASE_SERVICE_ROLE_KEY 가 없어 /admin/sellers 와
 * /seller 가 로컬에서 렌더링될 수 없다. 이 모듈은 그 경우에만 화면 확인용
 * 샘플 데이터를 공급한다. 프로덕션 빌드(NODE_ENV=production)에서는
 * groupbuyDemoMode() 가 항상 false — 이 데이터가 노출될 경로가 없다.
 */
import { GROUPBUY_STANDARD_OPTIONS, type RoundOption } from "@/lib/groupbuy";

export function groupbuyDemoMode(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export type DemoSeller = {
  id: string;
  user_id: string | null;
  handle: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  bank_info: { bank?: string; account?: string; holder?: string } | null;
  active: boolean;
  note: string | null;
};

export type DemoRound = {
  id: string;
  seller_id: string;
  round_no: number | null;
  type: "groupbuy" | "sponsored";
  status: string;
  handle: string | null;
  display_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  options: RoundOption[];
  commission_rate: number | null;
  settle_due_at: string | null;
  settled_at: string | null;
  settled_amount: number | null;
  request_note: string | null;
  admin_note: string | null;
};

export type DemoOrder = {
  round_id: string;
  status: string;
  amount: number;
  quantity: number;
  customer_name: string | null;
  order_name: string;
  approved_at: string | null;
  created_at: string;
};

const DAY = 86400_000;
const now = () => Date.now();
const iso = (t: number) => new Date(t).toISOString();

/** 셀러 지원 심사 데모 — 어드민 인박스 확인용 */
export const DEMO_APPLICATIONS = [
  {
    id: "demo-app-1",
    user_id: "demo-user-4",
    status: "pending",
    name: "박지원",
    phone: "01033334444",
    channel: "instagram.com/jiwon.beauty",
    follower: "인스타 3.2만",
    note: "뷰티 루틴 릴스 위주로 운영합니다. 9월 중 공구 희망합니다.",
    admin_note: null,
    created_at: iso(now() - 1 * DAY),
  },
];

/** 회원관리 화면용 데모 회원 — 셀러 권한 부여 흐름 확인 */
export const DEMO_MEMBERS = [
  {
    id: "demo-user-1",
    email: "ellie@example.com",
    full_name: "김엘리",
    phone: "01012345678",
    created_at: iso(now() - 60 * DAY),
  },
  {
    id: "demo-user-2",
    email: "haneul@example.com",
    full_name: "김하늘",
    phone: "01098765432",
    created_at: iso(now() - 12 * DAY),
  },
  {
    id: "demo-user-3",
    email: "customer@example.com",
    full_name: "박고객",
    phone: "01055556666",
    created_at: iso(now() - 3 * DAY),
  },
];

export const DEMO_SELLERS: DemoSeller[] = [
  {
    id: "demo-seller-1",
    user_id: "demo-user-1",
    handle: "demo",
    name: "엘리",
    phone: "01012345678",
    email: "ellie@example.com",
    bank_info: { bank: "국민", account: "123456-01-234567", holder: "김엘리" },
    active: true,
    note: "인스타 12만 팔로워 · 뷰티",
  },
  {
    id: "demo-seller-2",
    user_id: null,
    handle: null,
    name: "김하늘",
    phone: "01098765432",
    email: null,
    bank_info: null,
    active: true,
    note: "유튜브 5만 구독 · 협찬 위주",
  },
];

function opt(key: string): RoundOption {
  return GROUPBUY_STANDARD_OPTIONS.find((o) => o.key === key)!;
}

export const DEMO_ROUNDS: DemoRound[] = [
  {
    // 진행 중 (LIVE) — /product/@demo 와 연결
    id: "demo-round-live",
    seller_id: "demo-seller-1",
    round_no: 2,
    type: "groupbuy",
    status: "approved",
    handle: "demo",
    display_name: "엘리",
    starts_at: iso(now() - 5 * DAY),
    ends_at: iso(now() + 7 * DAY),
    options: GROUPBUY_STANDARD_OPTIONS,
    commission_rate: 20,
    settle_due_at: iso(now() + 28 * DAY),
    settled_at: null,
    settled_amount: null,
    request_note: "8월 둘째 주 희망, 3개월 구성 중심으로 홍보 예정",
    admin_note: null,
  },
  {
    // 승인 대기 신청
    id: "demo-round-req",
    seller_id: "demo-seller-2",
    round_no: null,
    type: "groupbuy",
    status: "requested",
    handle: null,
    display_name: null,
    starts_at: iso(now() + 22 * DAY),
    ends_at: iso(now() + 28 * DAY),
    options: [],
    commission_rate: null,
    settle_due_at: null,
    settled_at: null,
    settled_amount: null,
    request_note: "9월 첫 주 희망합니다. 구독자 대상 라이브 진행 예정.",
    admin_note: null,
  },
  {
    // 종료 + 정산 확정 완료
    id: "demo-round-done",
    seller_id: "demo-seller-1",
    round_no: 1,
    type: "groupbuy",
    status: "ended",
    handle: "ellie-jul",
    display_name: "엘리",
    starts_at: iso(now() - 45 * DAY),
    ends_at: iso(now() - 38 * DAY),
    options: GROUPBUY_STANDARD_OPTIONS,
    commission_rate: 20,
    settle_due_at: iso(now() - 17 * DAY),
    settled_at: iso(now() - 16 * DAY),
    settled_amount: 0, // 아래에서 주문 합계 기준으로 채운다
    request_note: null,
    admin_note: "7월 회차 — 정산 완료",
  },
];

/** (일수 전, 시각, 옵션, 상태, 주문자) 스펙으로 주문 생성 */
type Spec = [daysAgo: number, hour: number, key: string, status: string, name: string];

function ordersOf(roundId: string, specs: Spec[]): DemoOrder[] {
  return specs.map(([daysAgo, hour, key, status, name]) => {
    const o = opt(key);
    const t = now() - daysAgo * DAY - (23 - hour) * 3600_000;
    return {
      round_id: roundId,
      status,
      amount: o.price,
      quantity: o.months,
      customer_name: name,
      order_name: `glo GL-01 ${o.label}`,
      approved_at: status === "pending" ? null : iso(t),
      created_at: iso(t),
    };
  });
}

const LIVE_SPECS: Spec[] = [
  // 오늘
  [0, 9, "gb3", "paid", "김서연"],
  [0, 10, "gb1", "paid", "박지우"],
  [0, 12, "gb5", "paid", "이하은"],
  [0, 13, "gb3", "paid", "최민준"],
  // 어제
  [1, 9, "gb3", "paid", "정다은"],
  [1, 11, "gb2", "paid", "강태오"],
  [1, 14, "gb10", "paid", "윤소희"],
  [1, 16, "gb3", "paid", "임재현"],
  [1, 20, "gb1", "canceled", "한지민"],
  // 2~5일 전
  [2, 10, "gb3", "paid", "오세훈"],
  [2, 15, "gb5", "paid", "신유나"],
  [2, 19, "gb2", "paid", "배준서"],
  [3, 9, "gb12", "paid", "송하늘"],
  [3, 13, "gb3", "paid", "권나라"],
  [3, 18, "gb1", "paid", "황민서"],
  [4, 10, "gb3", "paid", "서지호"],
  [4, 12, "gb2", "paid", "문채원"],
  [4, 17, "gb5", "refunded", "장우진"],
  [5, 11, "gb3", "paid", "홍수아"],
  [5, 15, "gb8", "paid", "노예준"],
];

const DONE_SPECS: Spec[] = [
  [44, 10, "gb3", "paid", "김민지"],
  [44, 14, "gb5", "paid", "이준호"],
  [43, 9, "gb3", "paid", "박서준"],
  [43, 16, "gb10", "paid", "최유리"],
  [42, 11, "gb2", "paid", "정우성"],
  [42, 15, "gb3", "paid", "강하늘"],
  [41, 10, "gb12", "paid", "윤아름"],
  [41, 13, "gb3", "paid", "임시완"],
  [40, 9, "gb5", "paid", "한소희"],
  [40, 18, "gb1", "paid", "오연서"],
  [39, 12, "gb3", "paid", "신세경"],
  [39, 17, "gb2", "canceled", "배두나"],
  [38, 10, "gb8", "paid", "송중기"],
];

export const DEMO_ORDERS: DemoOrder[] = [
  ...ordersOf("demo-round-live", LIVE_SPECS),
  ...ordersOf("demo-round-done", DONE_SPECS),
];

/** 자사몰(일반) 데모 주문 — 주문관리 매출 분석(공구 vs 자사몰) 확인용 */
export type DemoDirectOrder = Omit<DemoOrder, "round_id"> & { round_id: null };

const DIRECT_SPECS: Array<[number, number, string, number, number, string, string]> = [
  // [일수 전, 시각, 라벨, 개월, 금액, 상태, 주문자]
  [0, 10, "1개월 분", 1, 99960, "paid", "신애"],
  [0, 14, "3개월 분", 3, 264180, "paid", "구현정"],
  [1, 9, "2개월 분", 2, 188020, "shipped", "박세미"],
  [1, 16, "1개월 분", 1, 99960, "shipped", "이도윤"],
  [2, 11, "3개월 분", 3, 264180, "shipped", "김하람"],
  [2, 13, "1개월 분", 1, 99960, "canceled", "정수빈"],
  [3, 10, "6개월 분", 6, 428400, "delivered", "최연우"],
  [3, 15, "2개월 분", 2, 188020, "delivered", "한서진"],
  [4, 12, "1개월 분", 1, 99960, "delivered", "오지유"],
  [5, 10, "3개월 분", 3, 264180, "delivered", "임가온"],
  [5, 17, "2개월 분", 2, 188020, "delivered", "황시우"],
  [6, 11, "1개월 분", 1, 99960, "delivered", "윤보라"],
];

export const DEMO_DIRECT_ORDERS: DemoDirectOrder[] = DIRECT_SPECS.map(
  ([daysAgo, hour, label, months, amount, status, name]) => {
    const t = now() - daysAgo * DAY - (23 - hour) * 3600_000;
    return {
      round_id: null,
      status,
      amount,
      quantity: months,
      customer_name: name,
      order_name: `glo GL-01 ${label}`,
      approved_at: status === "pending" ? null : iso(t),
      created_at: iso(t),
    };
  },
);

// 종료 회차의 확정 정산액 = paid 합계 × 20% (화면 숫자가 서로 맞도록)
{
  const doneSales = DEMO_ORDERS.filter(
    (o) => o.round_id === "demo-round-done" && o.status === "paid",
  ).reduce((s, o) => s + o.amount, 0);
  DEMO_ROUNDS[2].settled_amount = Math.round(doneSales * 0.2);
}
