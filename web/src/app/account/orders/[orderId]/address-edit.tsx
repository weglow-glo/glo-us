"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAUM_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: {
        oncomplete: (data: { zonecode: string; roadAddress: string; jibunAddress: string }) => void;
      }) => { open: () => void };
    };
  }
}

type Prefill = {
  recipient: string;
  phone: string;
  postcode: string;
  address: string;
  detail: string;
  memo: string;
};

/**
 * 고객 셀프 배송지 변경 — WMS 발주 전(paid)에만 서버가 허용한다.
 * 주문 상세의 배송 정보 카드 아래에서 인라인 폼으로 펼쳐진다.
 */
export default function AddressEdit({
  orderId,
  prefill,
}: {
  orderId: string;
  prefill: Prefill;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [f, setF] = useState(prefill);

  const set = (k: keyof Prefill) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  function openPostcode() {
    const run = () =>
      new window.daum!.Postcode({
        oncomplete: (d) =>
          setF((s) => ({ ...s, postcode: d.zonecode, address: d.roadAddress || d.jibunAddress })),
      }).open();
    if (window.daum) return run();
    const el = document.createElement("script");
    el.src = DAUM_SRC;
    el.async = true;
    el.onload = run;
    document.body.appendChild(el);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/address", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, ...f }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장에 실패했습니다.");
      setSaved(true);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
          className="rounded-full border border-ink-line px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          배송지 변경
        </button>
        {saved && <p className="mt-2 text-xs font-semibold text-accent">배송지가 변경되었습니다.</p>}
        <p className="mt-2 text-xs text-ink-faint">
          발주 전까지만 직접 변경할 수 있어요. 이후에는 고객센터로 문의해주세요.
        </p>
      </div>
    );
  }

  const input =
    "w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink outline-none focus:border-accent";

  return (
    <div className="mt-4 rounded-xl border border-ink-line bg-bg-1 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-mute">
          수령인
          <input className={`${input} mt-1`} value={f.recipient} onChange={set("recipient")} />
        </label>
        <label className="text-xs text-ink-mute">
          휴대폰
          <input
            className={`${input} mt-1`}
            type="tel"
            value={f.phone}
            onChange={set("phone")}
            placeholder="01012345678"
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <input className={input} value={f.postcode} readOnly placeholder="우편번호" />
        <button
          type="button"
          onClick={openPostcode}
          className="shrink-0 rounded-md border border-ink-line px-4 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          주소 검색
        </button>
      </div>
      <input className={`${input} mt-2`} value={f.address} readOnly placeholder="주소" />
      <input
        className={`${input} mt-2`}
        value={f.detail}
        onChange={set("detail")}
        placeholder="상세 주소 (동·호수 등)"
      />
      <input
        className={`${input} mt-2`}
        value={f.memo}
        onChange={set("memo")}
        placeholder="배송메모 (선택)"
      />
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-full bg-burg-600 px-5 py-2 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:opacity-50"
        >
          {busy ? "저장 중…" : "변경 저장"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="rounded-full border border-ink-line px-5 py-2 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
        >
          취소
        </button>
      </div>
    </div>
  );
}
