import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSellerContext } from "../_lib";
import { updateMyProfile } from "../actions";
import { DEMO_SELLERS, groupbuyDemoMode } from "@/lib/groupbuy-demo";

export const dynamic = "force-dynamic";

type BankInfo = { bank?: string; account?: string; holder?: string } | null;

/** 내 정보 — 연락처·정산 계좌를 셀러가 직접 관리 (운영자는 조회만) */
export default async function SellerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const ctx = await getSellerContext();
  if (!ctx) redirect("/seller");
  const { saved } = await searchParams;

  let phone: string | null = null;
  let email: string | null = null;
  let bank: BankInfo = null;

  if (groupbuyDemoMode()) {
    // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
    const s = DEMO_SELLERS.find((d) => d.id === ctx.sellerId);
    phone = s?.phone ?? null;
    email = s?.email ?? null;
    bank = s?.bank_info ?? null;
  } else {
    const admin = createAdminClient();
    const { data } = await admin
      .from("sellers")
      .select("phone, email, bank_info")
      .eq("id", ctx.sellerId)
      .maybeSingle<{ phone: string | null; email: string | null; bank_info: BankInfo }>();
    phone = data?.phone ?? null;
    email = data?.email ?? null;
    bank = data?.bank_info ?? null;
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <h1 className="font-sans text-2xl font-light text-ink">내 정보</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        연락처로 심사·일정·정산 안내가 발송되고, 정산 계좌로 정산금이 입금됩니다.
        정확하게 입력해주세요.
      </p>

      {saved && (
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-sm font-medium text-accent">
          저장되었습니다.
        </p>
      )}
      {!bank && (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          정산 계좌가 아직 없습니다 — 계좌가 있어야 정산금을 지급해 드릴 수 있습니다.
        </p>
      )}

      <form action={updateMyProfile} className="mt-8 grid gap-4">
        <Field label="연락처" name="phone" defaultValue={phone ?? ""} placeholder="01012345678" type="tel" required />
        <Field label="이메일 (선택)" name="email" defaultValue={email ?? ""} placeholder="ellie@example.com" type="email" />

        <p className="mt-2 text-sm font-semibold text-ink">정산 계좌</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="은행" name="bank" defaultValue={bank?.bank ?? ""} placeholder="국민" />
          <Field label="계좌번호" name="account" defaultValue={bank?.account ?? ""} placeholder="123456-01-234567" />
          <Field label="예금주" name="holder" defaultValue={bank?.holder ?? ""} placeholder="김엘리" />
        </div>

        <button className="mt-2 rounded-full bg-burg-600 px-8 py-3.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
          저장
        </button>
        <p className="text-xs leading-relaxed text-ink-mute">
          입력하신 정보는 셀러 운영·정산 목적으로만 사용되며, 운영팀만 확인할 수
          있습니다.
        </p>
      </form>
    </main>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
