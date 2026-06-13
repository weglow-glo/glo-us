"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadTossPayments,
  ANONYMOUS,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import { PRODUCT, PREORDER, orderName, formatKRW } from "@/lib/product";

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

export default function CheckoutPage() {
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const amount = PRODUCT.price * quantity;
  const regularAmount = PRODUCT.regularPrice * quantity;

  // Initialise the Toss widgets once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const toss = await loadTossPayments(CLIENT_KEY);
      const widgets = toss.widgets({ customerKey: ANONYMOUS });
      await widgets.setAmount({ currency: "KRW", value: PRODUCT.price });
      if (cancelled) return;
      await Promise.all([
        widgets.renderPaymentMethods({
          selector: "#payment-method",
          variantKey: "DEFAULT",
        }),
        widgets.renderAgreement({
          selector: "#agreement",
          variantKey: "AGREEMENT",
        }),
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
  }, []);

  // Keep the widget amount in sync with quantity.
  useEffect(() => {
    if (!ready || !widgetsRef.current) return;
    widgetsRef.current.setAmount({ currency: "KRW", value: amount });
  }, [amount, ready]);

  async function handlePay() {
    if (!widgetsRef.current || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1) Create a pending order (amount computed server-side).
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity,
          customerName: name,
          customerEmail: email,
          customerPhone: phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "주문 생성 실패");

      // 2) Launch the Toss payment window.
      await widgetsRef.current.requestPayment({
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
        customerEmail: email || undefined,
        customerName: name || undefined,
        customerMobilePhone: phone || undefined,
      });
      // requestPayment redirects on success; nothing runs after this.
    } catch (e) {
      const message = e instanceof Error ? e.message : "결제 요청에 실패했습니다.";
      // User-cancelled payments throw too — don't treat as a hard error.
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-20">
      <div className="font-display text-3xl font-light tracking-tight text-ink">
        glo<span className="italic text-accent">.</span>
      </div>
      <h1 className="mt-8 font-display text-4xl font-light text-ink">결제</h1>

      {/* Order summary */}
      <section className="mt-10 rounded-xl border border-ink-line bg-bg-2 p-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-block rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold tracking-wide text-cream">
              사전할인 {PREORDER.discountPct}%
            </span>
            <p className="mt-2 font-display text-xl text-ink">{PRODUCT.name}</p>
            <p className="mt-1 text-sm text-ink-mute">15ml 데일리 샷 · 스킨 롱제비티</p>
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="qty" className="text-sm text-ink-mute">
              수량
            </label>
            <select
              id="qty"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-ink-line pt-4">
          <span className="text-sm font-semibold uppercase tracking-wide text-ink-mute">
            결제 금액
          </span>
          <span className="flex items-baseline gap-2">
            <span className="text-sm text-ink-faint line-through">
              {formatKRW(regularAmount)}
            </span>
            <span className="font-display text-2xl text-ink">{formatKRW(amount)}</span>
          </span>
        </div>
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          <b className="text-accent">{PREORDER.shipNote}</b>
          <br />
          사전결제하신 모든 주문은 {PREORDER.shipDate}에 함께 발송됩니다. {PREORDER.shipDate}{" "}
          정식 출시와 함께 정상가({formatKRW(PRODUCT.regularPrice)})로 전환됩니다.
        </p>
      </section>

      {/* Customer info */}
      <section className="mt-8 grid gap-4">
        <Field label="이름" value={name} onChange={setName} placeholder="홍길동" />
        <Field
          label="이메일"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          type="email"
        />
        <Field
          label="휴대폰"
          value={phone}
          onChange={setPhone}
          placeholder="01012345678"
          type="tel"
        />
      </section>

      {/* Toss widgets */}
      <div id="payment-method" className="mt-8" />
      <div id="agreement" className="mt-2" />

      {error && (
        <p className="mt-4 rounded-md bg-bg-3 px-4 py-3 text-sm text-burg-400">
          {error}
        </p>
      )}

      <button
        onClick={handlePay}
        disabled={!ready || submitting}
        className="mt-6 w-full rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "처리 중…" : `${formatKRW(amount)} 결제하기`}
      </button>
      <p className="mt-3 text-center text-xs text-ink-faint">
        테스트 환경입니다. 실제 결제가 발생하지 않습니다.
      </p>
    </main>
  );
}

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
