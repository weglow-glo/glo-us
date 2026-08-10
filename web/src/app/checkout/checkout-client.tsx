"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  loadTossPayments,
  ANONYMOUS,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import {
  OPTIONS,
  PRODUCT,
  getOption,
  currentPrice,
  formatPct,
  formatKRW,
} from "@/lib/product";
import { type RoundOption, type RoundType } from "@/lib/groupbuy";
import type { Address } from "@/lib/address";
import { metaTrack } from "@/lib/meta";
import { naverConv } from "@/lib/naver-cts";

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;
const IS_TEST_KEY = CLIENT_KEY?.startsWith("test_") ?? false;
const DAUM_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

declare global {
  interface Window {
    daum?: {
      Postcode: new (opts: {
        oncomplete: (data: { zonecode: string; roadAddress: string; jibunAddress: string }) => void;
      }) => { open: () => void };
    };
  }
}

/** 일반 옵션·회차 전용 옵션을 하나로 다루기 위한 최소 형태 */
type CheckoutOption = { key: string; months: number; label: string; price: number };

export type CheckoutRound = {
  handle: string;
  displayName: string | null;
  type: RoundType;
  options: RoundOption[];
};

export default function CheckoutClient({
  initialOption,
  round = null,
  defaultName = "",
  defaultPhone = "",
  accountEmail = "",
}: {
  initialOption: string;
  round?: CheckoutRound | null;
  defaultName?: string;
  defaultPhone?: string;
  accountEmail?: string;
}) {
  const router = useRouter();
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 회차(공구·협찬) 체크아웃이면 옵션·가격은 회차 전용 구성에서만 나온다.
  const optionList: CheckoutOption[] = useMemo(
    () =>
      round
        ? round.options
        : OPTIONS.map((o) => ({ ...o, price: currentPrice(o) })),
    [round],
  );
  const [optionKey, setOptionKey] = useState(() =>
    round
      ? (round.options.find((o) => o.key === initialOption) ?? round.options[0]).key
      : getOption(initialOption).key,
  );
  const opt = useMemo(
    () => optionList.find((o) => o.key === optionKey) ?? optionList[0],
    [optionList, optionKey],
  );

  // 포인트 — 잔액은 서버에서, 사용액은 [0, min(잔액, 상품가-100)]로 클램프.
  // (토스 최소 결제금액 100원을 남겨야 한다)
  // 회차 주문은 포인트 사용 불가 — 잔액을 아예 불러오지 않아 UI 도 뜨지 않는다.
  const [pointBalance, setPointBalance] = useState(0);
  const [pointInput, setPointInput] = useState(0);
  const maxUsable = round ? 0 : Math.max(0, Math.min(pointBalance, opt.price - 100));
  const usePoints = Math.max(0, Math.min(pointInput, maxUsable));
  const amount = opt.price - usePoints;
  const regularAmount = opt.months * PRODUCT.regularPrice;
  const discount = Math.round((1 - opt.price / regularAmount) * 1000) / 10;

  // Prefill from the signed-in Kakao account (nickname only — phone/address
  // aren't shared by Kakao without extra approved consent scopes).
  const [recipient, setRecipient] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const [memo, setMemo] = useState("");

  // Saved address book (prefill default + pick/add/delete/set-default modal).
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [showAddr, setShowAddr] = useState(false);
  const [addrBusy, setAddrBusy] = useState(false);
  const prefilledRef = useRef(false);

  // Field-level validation highlight (declared before applyAddress uses it).
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  const clearInvalid = (k: string) =>
    setInvalid((s) => (s[k] ? { ...s, [k]: false } : s));

  const applyAddress = (a: Address) => {
    setRecipient(a.recipient);
    setPhone(a.phone);
    setPostcode(a.postcode ?? "");
    setAddress(a.address ?? "");
    setDetail(a.detail ?? "");
    setMemo(a.memo ?? "");
    setInvalid({});
  };

  const loadAddresses = async (prefill = false) => {
    try {
      const res = await fetch("/api/addresses", { cache: "no-store" });
      if (!res.ok) return;
      const { addresses: list } = (await res.json()) as { addresses: Address[] };
      setAddresses(list ?? []);
      // On first load, default to the user's default (or most recent) address.
      if (prefill && !prefilledRef.current && list && list.length > 0) {
        prefilledRef.current = true;
        applyAddress(list.find((a) => a.is_default) ?? list[0]);
      }
    } catch {
      /* address book is best-effort */
    }
  };

  useEffect(() => {
    loadAddresses(true);
    if (!round) {
      fetch("/api/points/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { balance?: number }) => setPointBalance(d.balance ?? 0))
        .catch(() => {});
    }
    metaTrack("InitiateCheckout", {
      content_ids: ["GL-01"],
      content_type: "product",
      content_category: round ? "groupbuy" : undefined,
      currency: "KRW",
      value: opt.price,
    });
    naverConv({
      type: "begin_checkout",
      items: [{ id: "GL-01", name: `${PRODUCT.name} ${opt.label}`, quantity: opt.months, payAmount: opt.price }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCurrentAddress() {
    if (addrBusy) return;
    if (!recipient.trim() || !phone.trim() || !address.trim()) {
      showToast("현재 입력한 수령인·연락처·주소를 먼저 채워주세요.");
      return;
    }
    setAddrBusy(true);
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, phone, postcode, address, detail, memo }),
      });
      if (res.ok) await loadAddresses();
    } finally {
      setAddrBusy(false);
    }
  }

  async function setDefaultAddress(id: string) {
    setAddrBusy(true);
    try {
      const res = await fetch("/api/addresses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await loadAddresses();
    } finally {
      setAddrBusy(false);
    }
  }

  async function deleteAddress(id: string) {
    setAddrBusy(true);
    try {
      const res = await fetch("/api/addresses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await loadAddresses();
    } finally {
      setAddrBusy(false);
    }
  }

  // Auto-dismissing top toast.
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null);
  const toastSeq = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (msg: string) => {
    clearTimeout(toastTimer.current);
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, msg }); // keyed remount re-runs the CSS animation
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const toss = await loadTossPayments(CLIENT_KEY);
      const widgets = toss.widgets({ customerKey: ANONYMOUS });
      await widgets.setAmount({ currency: "KRW", value: opt.price });
      if (cancelled) return;
      await Promise.all([
        widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT-2" }),
        widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
      ]);
      if (cancelled) return;
      widgetsRef.current = widgets;
      setReady(true);
    })().catch((e) => {
      console.error(e);
      setError("결제 위젯을 불러오지 못했습니다.");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (document.getElementById("daum-postcode")) return;
    const s = document.createElement("script");
    s.id = "daum-postcode";
    s.src = DAUM_SRC;
    s.async = true;
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    if (!ready || !widgetsRef.current) return;
    widgetsRef.current.setAmount({ currency: "KRW", value: amount });
  }, [amount, ready]);

  function openPostcode() {
    if (!window.daum?.Postcode) {
      setError("우편번호 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => {
        setPostcode(data.zonecode);
        setAddress(data.roadAddress || data.jibunAddress);
        clearInvalid("address");
        document.getElementById("addr-detail")?.focus();
      },
    }).open();
  }

  async function handlePay() {
    if (!widgetsRef.current || submitting) return;

    const miss: Record<string, boolean> = {};
    if (!recipient.trim()) miss.recipient = true;
    if (!phone.trim()) miss.phone = true;
    if (!postcode || !address) miss.address = true;
    if (!detail.trim()) miss.detail = true;
    if (Object.keys(miss).length > 0) {
      setInvalid(miss);
      showToast("수령인, 연락처, 배송지 주소를 모두 입력해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option: optionKey,
          round: round?.handle,
          customerName: recipient,
          customerEmail: accountEmail,
          customerPhone: phone,
          shippingAddress: { recipient, phone, postcode, address, detail, memo },
          usePoints,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "주문 생성 실패");

      await widgetsRef.current.requestPayment({
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
        customerEmail: accountEmail || undefined,
        customerName: recipient || undefined,
        customerMobilePhone: phone || undefined,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "결제 요청에 실패했습니다.";
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-36 pt-10 sm:px-6 sm:pb-12">
      {/* Auto-dismissing validation toast — fades in/out at the top */}
      {toast && (
        <div
          key={toast.id}
          role="alert"
          className="glo-toast fixed left-1/2 top-4 z-[60] max-w-[calc(100%-2rem)] whitespace-nowrap rounded-xl border border-ink-line bg-bg-1 px-5 py-3 text-sm font-medium text-burg-400 shadow-[0_12px_40px_rgba(58,26,34,0.18)]"
        >
          {toast.msg}
        </div>
      )}

      {/* Saved-address picker modal */}
      {showAddr && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-burg-900/40 sm:items-center"
          onClick={() => setShowAddr(false)}
        >
          <div
            className="max-h-[82vh] w-full overflow-y-auto rounded-t-2xl bg-bg-1 p-5 sm:max-w-md sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-sans text-lg text-ink">저장된 배송지</h3>
              <button
                type="button"
                onClick={() => setShowAddr(false)}
                className="rounded-full px-2 text-xl leading-none text-ink-mute hover:text-ink"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {addresses.map((a) => (
                <li key={a.id} className="rounded-xl border border-ink-line p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{a.recipient}</span>
                    <span className="text-sm text-ink-mute">{a.phone}</span>
                    {a.is_default && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-cream">
                        기본
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {[a.postcode ? `(${a.postcode})` : "", a.address, a.detail]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        applyAddress(a);
                        setShowAddr(false);
                      }}
                      className="rounded-full bg-burg-600 px-4 py-1.5 text-xs font-semibold text-bg-1 transition hover:bg-burg-400"
                    >
                      이 주소 사용
                    </button>
                    {!a.is_default && (
                      <button
                        type="button"
                        disabled={addrBusy}
                        onClick={() => setDefaultAddress(a.id)}
                        className="rounded-full border border-ink-line px-4 py-1.5 text-xs font-medium text-ink-soft transition hover:border-accent hover:text-accent disabled:opacity-50"
                      >
                        기본으로
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={addrBusy}
                      onClick={() => deleteAddress(a.id)}
                      className="ml-auto text-xs font-medium text-burg-400 hover:underline disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
              {addresses.length === 0 && (
                <li className="rounded-xl border border-dashed border-ink-line p-6 text-center text-sm text-ink-mute">
                  저장된 배송지가 없습니다.
                </li>
              )}
            </ul>

            <button
              type="button"
              onClick={saveCurrentAddress}
              disabled={addrBusy}
              className="mt-4 w-full rounded-full border border-ink-line py-2.5 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              + 현재 입력한 주소 저장
            </button>
          </div>
        </div>
      )}

      {/* Top bar — logo home + back */}
      <div className="flex items-center justify-between">
        <Link href="/" className="font-display text-3xl font-light tracking-tight text-ink">
          glo<span className="italic text-accent">.</span>
        </Link>
        <button
          onClick={() => router.back()}
          className="rounded-full border border-ink-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
        >
          ← 뒤로
        </button>
      </div>

      {/* Order summary */}
      <section className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="inline-block rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold tracking-wide text-cream">
              {round ? "프로모션 혜택가" : "런칭 할인"} {formatPct(discount)}
            </span>
            <p className="mt-2 font-sans text-xl text-ink">{PREORDER_NAME}</p>
            <p className="mt-1 text-sm text-ink-mute">
              {round ? (
                <>
                  {round.displayName ?? "셀러"}님 × <span className="font-display">glo</span>{" "}
                  프로모션 전용 구성
                </>
              ) : (
                "20ml 데일리 샷 · 스킨 롱제비티"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="opt" className="shrink-0 whitespace-nowrap text-sm text-ink-mute">
              구성
            </label>
            <select
              id="opt"
              value={optionKey}
              onChange={(e) => setOptionKey(e.target.value)}
              className="w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink sm:w-auto"
            >
              {optionList.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} — {formatKRW(o.price)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {pointBalance > 0 && (
          <div className="mt-6 border-t border-ink-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-sm font-medium text-ink-soft">포인트 사용</span>
                <p className="mt-0.5 text-xs text-ink-faint">
                  보유 {pointBalance.toLocaleString("ko-KR")}P
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={maxUsable}
                  value={pointInput === 0 ? "" : pointInput}
                  placeholder="0"
                  onChange={(e) =>
                    setPointInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                  }
                  onBlur={() => setPointInput(usePoints)}
                  className="w-28 rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-right text-sm text-ink outline-none focus:border-accent"
                />
                <span className="text-sm text-ink-mute">P</span>
                <button
                  type="button"
                  onClick={() => setPointInput(maxUsable)}
                  className="rounded-full border border-ink-line px-3 py-1.5 text-xs font-medium text-ink-soft transition hover:border-accent hover:text-accent"
                >
                  전액 사용
                </button>
              </div>
            </div>
            {usePoints > 0 && (
              <p className="mt-2 text-right text-xs text-accent">
                −{formatKRW(usePoints)} 차감
              </p>
            )}
          </div>
        )}
        <div className="mt-6 flex items-center justify-between border-t border-ink-line pt-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-mute">결제 금액</span>
          <span className="flex items-baseline gap-2">
            <span className="text-sm text-ink-faint line-through">{formatKRW(regularAmount)}</span>
            <span className="font-sans text-2xl text-ink">{formatKRW(amount)}</span>
          </span>
        </div>
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          <b className="text-accent">결제 후 순차 배송</b>
          <br />
          배송이 시작되면 문자로 송장번호와 배송 조회 링크를 보내드립니다.
          {round && (
            <>
              <br />
              프로모션 주문은 포인트 적립·사용 대상이 아니며, 배송·교환·환불은 일반
              주문과 동일하게 처리됩니다.
            </>
          )}
        </p>
      </section>

      {/* Shipping */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-sans text-xl text-ink">배송 정보</h2>
          {addresses.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAddr(true)}
              className="shrink-0 rounded-full border border-ink-line px-3.5 py-1.5 text-xs font-medium text-ink-soft transition hover:border-accent hover:text-accent"
            >
              저장된 배송지 {addresses.length}
            </button>
          )}
        </div>
        <div className="grid gap-4">
          <Field
            label="수령인"
            value={recipient}
            onChange={(v) => {
              setRecipient(v);
              clearInvalid("recipient");
            }}
            placeholder="홍길동"
            error={invalid.recipient}
          />
          <Field
            label="휴대폰"
            value={phone}
            onChange={(v) => {
              setPhone(v);
              clearInvalid("phone");
            }}
            placeholder="01012345678"
            type="tel"
            error={invalid.phone}
          />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">주소</span>
            <div className="flex gap-2">
              <input
                value={postcode}
                readOnly
                placeholder="우편번호"
                className={`w-32 rounded-md border bg-bg-2 px-4 py-3 text-sm text-ink outline-none ${
                  invalid.address ? "border-red-500 bg-red-50" : "border-ink-line"
                }`}
              />
              <button
                type="button"
                onClick={openPostcode}
                className="shrink-0 rounded-md border border-ink-line px-4 py-3 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
              >
                우편번호 검색
              </button>
            </div>
            <input
              value={address}
              readOnly
              placeholder="기본 주소 (검색으로 입력)"
              className={`mt-2 w-full rounded-md border bg-bg-2 px-4 py-3 text-sm text-ink outline-none ${
                invalid.address ? "border-red-500 bg-red-50" : "border-ink-line"
              }`}
            />
            <input
              id="addr-detail"
              value={detail}
              onChange={(e) => {
                setDetail(e.target.value);
                clearInvalid("detail");
              }}
              placeholder="상세 주소 (동·호수 등)"
              className={`mt-2 w-full rounded-md border px-4 py-3 text-sm text-ink outline-none focus:border-accent ${
                invalid.detail ? "border-red-500 bg-red-50" : "border-ink-line bg-bg-1"
              }`}
            />
          </div>

          <Field label="배송 메모 (선택)" value={memo} onChange={setMemo} placeholder="부재 시 문 앞에 두세요" />

          <button
            type="button"
            onClick={saveCurrentAddress}
            disabled={addrBusy}
            className="justify-self-start text-sm font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
          >
            + 이 배송지를 저장
          </button>
        </div>
      </section>

      {/* Toss widgets */}
      <div id="payment-method" className="mt-8" />
      <div id="agreement" className="mt-2" />

      {error && (
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-sm text-burg-400">{error}</p>
      )}

      {/* Pay button — floating bottom bar on mobile, inline on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-line bg-bg-1/95 px-4 py-4 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="w-full">
          <button
            onClick={handlePay}
            disabled={!ready || submitting}
            className="w-full rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "처리 중…" : `${formatKRW(amount)} 결제하기`}
          </button>
          {IS_TEST_KEY && (
            <p className="mt-2 text-center text-xs text-ink-faint sm:mt-3">
              테스트 환경입니다. 실제 결제가 발생하지 않습니다.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

const PREORDER_NAME = "glo GL-01";

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border px-4 py-3 text-sm text-ink outline-none focus:border-accent ${
          error ? "border-red-500 bg-red-50" : "border-ink-line bg-bg-1"
        }`}
      />
    </label>
  );
}
