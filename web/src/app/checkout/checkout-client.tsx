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
  getOption,
  regularOf,
  discountOf,
  formatPct,
  formatKRW,
  PREORDER,
} from "@/lib/product";

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;
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

export default function CheckoutClient({ initialOption }: { initialOption: string }) {
  const router = useRouter();
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [optionKey, setOptionKey] = useState(() => getOption(initialOption).key);
  const opt = useMemo(() => getOption(optionKey), [optionKey]);
  const amount = opt.price;
  const regularAmount = regularOf(opt);
  const discount = discountOf(opt);

  const [recipient, setRecipient] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const toss = await loadTossPayments(CLIENT_KEY);
      const widgets = toss.widgets({ customerKey: ANONYMOUS });
      await widgets.setAmount({ currency: "KRW", value: opt.price });
      if (cancelled) return;
      await Promise.all([
        widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
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
        document.getElementById("addr-detail")?.focus();
      },
    }).open();
  }

  async function handlePay() {
    if (!widgetsRef.current || submitting) return;

    if (!recipient.trim() || !phone.trim() || !postcode || !address || !detail.trim()) {
      setError("수령인, 연락처, 배송지 주소를 모두 입력해주세요.");
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
          customerName: recipient,
          customerEmail: email,
          customerPhone: phone,
          shippingAddress: { recipient, phone, postcode, address, detail, memo },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "주문 생성 실패");

      await widgetsRef.current.requestPayment({
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
        customerEmail: email || undefined,
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
    <main id="main" className="mx-auto max-w-2xl px-6 pb-36 pt-12 sm:pb-12">
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
              사전할인 {formatPct(discount)}
            </span>
            <p className="mt-2 font-display text-xl text-ink">{PREORDER_NAME}</p>
            <p className="mt-1 text-sm text-ink-mute">15ml 데일리 샷 · 스킨 롱제비티</p>
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
              {OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} — {formatKRW(o.price)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-ink-line pt-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-mute">결제 금액</span>
          <span className="flex items-baseline gap-2">
            <span className="text-sm text-ink-faint line-through">{formatKRW(regularAmount)}</span>
            <span className="font-display text-2xl text-ink">{formatKRW(amount)}</span>
          </span>
        </div>
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          <b className="text-accent">{PREORDER.shipNote}</b>
          <br />
          사전결제하신 모든 주문은 {PREORDER.shipDate}에 함께 발송됩니다. {PREORDER.shipDate}{" "}
          정식 출시와 함께 정상가로 전환됩니다.
        </p>
      </section>

      {/* Shipping */}
      <section className="mt-8">
        <h2 className="mb-4 font-display text-xl text-ink">배송 정보</h2>
        <div className="grid gap-4">
          <Field label="수령인" value={recipient} onChange={setRecipient} placeholder="홍길동" />
          <Field label="휴대폰" value={phone} onChange={setPhone} placeholder="01012345678" type="tel" />
          <Field
            label="이메일 (주문 확인용)"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            type="email"
          />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-soft">주소</span>
            <div className="flex gap-2">
              <input
                value={postcode}
                readOnly
                placeholder="우편번호"
                className="w-32 rounded-md border border-ink-line bg-bg-2 px-4 py-3 text-sm text-ink outline-none"
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
              className="mt-2 w-full rounded-md border border-ink-line bg-bg-2 px-4 py-3 text-sm text-ink outline-none"
            />
            <input
              id="addr-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="상세 주소 (동·호수 등)"
              className="mt-2 w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
            />
          </div>

          <Field label="배송 메모 (선택)" value={memo} onChange={setMemo} placeholder="부재 시 문 앞에 두세요" />
        </div>
      </section>

      {/* Toss widgets */}
      <div id="payment-method" className="mt-8" />
      <div id="agreement" className="mt-2" />

      {error && (
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-sm text-burg-400">{error}</p>
      )}

      {/* Pay button — floating bottom bar on mobile, inline on desktop */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-line bg-bg-1/95 px-6 py-4 backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={handlePay}
            disabled={!ready || submitting}
            className="w-full rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "처리 중…" : `${formatKRW(amount)} 결제하기`}
          </button>
          <p className="mt-2 text-center text-xs text-ink-faint sm:mt-3">
            테스트 환경입니다. 실제 결제가 발생하지 않습니다.
          </p>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-ink-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
