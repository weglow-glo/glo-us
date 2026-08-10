import { redirect } from "next/navigation";
import { getSellerContext } from "../_lib";
import { requestRound } from "../actions";

export const dynamic = "force-dynamic";

/** 공동구매 일정 신청 — 승인되면 전용 링크·가격·수수료율이 확정된다 */
export default async function SellerApplyPage() {
  const ctx = await getSellerContext();
  if (!ctx) redirect("/seller");

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="font-sans text-2xl font-light text-ink">공동구매 일정 신청</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        희망 기간을 신청하면 운영팀이 확인 후 전용 링크와 조건(구성·가격·수수료율)을
        확정해 드립니다. 승인 결과는 등록된 연락처로 안내됩니다.
      </p>

      <form action={requestRound} className="mt-8 grid gap-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">시작 일시</span>
          <input
            name="starts_at"
            type="datetime-local"
            required
            className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
          />
          <span className="mt-1 block text-xs text-ink-mute">
            링크가 열리는 시각 — 예: 오후 8시 오픈이면 20:00
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">종료 일시</span>
          <input
            name="ends_at"
            type="datetime-local"
            required
            className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
          />
          <span className="mt-1 block text-xs text-ink-mute">
            이 시각 이후에는 결제가 자동으로 닫힙니다
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">
            요청사항 (선택)
          </span>
          <textarea
            name="request_note"
            rows={4}
            maxLength={500}
            placeholder="희망 구성·가격대, 예상 판매량, 진행 채널 등을 적어주세요."
            className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <button className="mt-2 rounded-full bg-burg-600 px-8 py-3.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
          신청하기
        </button>
        <p className="text-xs leading-relaxed text-ink-mute">
          정산은 회차 종료 21일 후 결제완료 스냅샷 기준으로 확정되며, 취소·환불 건은
          차감됩니다. 공동구매 주문은 포인트 적립·사용 대상이 아닙니다.
        </p>
      </form>
    </main>
  );
}
