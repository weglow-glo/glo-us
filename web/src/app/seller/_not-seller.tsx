import { applyForSeller } from "./actions";
import type { SellerApplication } from "./_lib";

/**
 * 셀러가 아닌 로그인 계정의 /seller 첫 화면.
 * 지원 전 → 지원 폼 / 심사 중 → 안내 / 반려 → 사유 + 재지원 폼.
 */
export default function NotSeller({
  application,
  defaultName = "",
  defaultPhone = "",
}: {
  application?: SellerApplication | null;
  defaultName?: string;
  defaultPhone?: string;
}) {
  // 심사 중 — 결과가 나오기 전 문구
  if (application?.status === "pending") {
    return (
      <main className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="inline-block rounded-full bg-bg-3 px-4 py-1.5 text-xs font-bold tracking-wide text-accent">
          심사 진행 중
        </p>
        <h1 className="mt-4 font-sans text-2xl font-light text-ink">
          셀러 지원이 접수되었습니다
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {application.name}님의 지원서를 확인하고 있습니다.
          <br />
          심사가 완료되면 등록하신 연락처로 문자 안내를 드립니다.
          <br />
          (영업일 기준 2~3일 소요)
        </p>
        <p className="mt-6 text-xs text-ink-mute">
          문의:{" "}
          <a href="mailto:official@weglow.biz" className="text-accent hover:underline">
            official@weglow.biz
          </a>
        </p>
      </main>
    );
  }

  const rejected = application?.status === "rejected";

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-sans text-2xl font-light text-ink">
        <span className="font-display">glo</span> 셀러 지원
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        공동구매·협찬 진행을 원하시면 아래 내용을 보내주세요. 심사 후 결과를 문자로
        안내드리며, 승인되면 이 계정으로 셀러 센터(일정 신청·실시간 매출·정산)가 열립니다.
      </p>

      {rejected && (
        <div className="mt-5 rounded-md bg-bg-3 px-4 py-3 text-sm text-ink-soft">
          <p className="font-semibold text-burg-400">이전 지원은 함께하지 못하게 되었습니다.</p>
          {application?.admin_note && <p className="mt-1">사유: {application.admin_note}</p>}
          <p className="mt-1 text-xs text-ink-mute">내용을 보완해 다시 지원하실 수 있습니다.</p>
        </div>
      )}

      <form action={applyForSeller} className="mt-8 grid gap-4">
        <Field name="name" label="이름 / 활동명" required defaultValue={defaultName} placeholder="엘리" />
        <Field
          name="phone"
          label="연락처 (심사 결과 안내)"
          required
          defaultValue={defaultPhone}
          placeholder="01012345678"
          type="tel"
        />
        <Field
          name="channel"
          label="채널 링크"
          required
          placeholder="인스타그램 · 유튜브 · 블로그 주소"
        />
        <Field name="follower" label="팔로워 / 구독자 규모" placeholder="예: 인스타 3.2만" />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-soft">
            소개 · 판매 계획 (선택)
          </span>
          <textarea
            name="note"
            rows={4}
            placeholder="주로 다루는 콘텐츠, 희망 진행 방식 등을 적어주세요."
            className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <button className="rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
          {rejected ? "다시 지원하기" : "셀러 지원하기"}
        </button>
        <p className="text-xs leading-relaxed text-ink-mute">
          제출하신 정보는 셀러 심사 목적으로만 사용됩니다. 이미 셀러 계약이 완료된 분이라면,
          계약에 사용한 카카오 계정으로 로그인했는지 확인해주세요.
        </p>
      </form>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  required = false,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
