"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatKRW } from "@/lib/product";
import { metaTrack } from "@/lib/meta";

type Result =
  | { state: "loading" }
  | { state: "ok"; orderName?: string; method?: string; totalAmount?: number }
  | { state: "error"; message: string };

function SuccessInner() {
  const params = useSearchParams();
  const [result, setResult] = useState<Result>({ state: "loading" });
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (confirmedRef.current) return; // confirm exactly once
    confirmedRef.current = true;

    const paymentKey = params.get("paymentKey");
    const orderId = params.get("orderId");
    const amount = Number(params.get("amount"));

    if (!paymentKey || !orderId || !amount) {
      setResult({ state: "error", message: "결제 정보가 올바르지 않습니다." });
      return;
    }

    fetch("/api/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "결제 승인에 실패했습니다.");
        setResult({
          state: "ok",
          orderName: data.orderName,
          method: data.method,
          totalAmount: data.totalAmount,
        });
        // Browser Purchase event — deduped with the server CAPI via event_id = orderId.
        metaTrack(
          "Purchase",
          {
            value: data.totalAmount ?? amount,
            currency: "KRW",
            content_ids: ["GL-01"],
            content_type: "product",
          },
          orderId,
        );
      })
      .catch((e) =>
        setResult({
          state: "error",
          message: e instanceof Error ? e.message : "결제 승인에 실패했습니다.",
        }),
      );
  }, [params]);

  if (result.state === "loading") {
    return <Centered title="결제를 확인하고 있습니다…" />;
  }

  if (result.state === "error") {
    return (
      <Centered title="결제 승인 실패" tone="error">
        <p className="mt-3 text-sm text-ink-soft">{result.message}</p>
        <Link href="/checkout" className="mt-8 inline-block underline">
          다시 시도하기
        </Link>
      </Centered>
    );
  }

  return (
    <Centered
      title="결제가 완료되었습니다."
      titleClassName="whitespace-nowrap text-[1.45rem] sm:text-3xl"
    >
      <p className="mt-3 font-display text-base italic text-accent">
        A quieter kind of glow.
      </p>
      <dl className="mx-auto mt-8 w-full max-w-sm space-y-3 rounded-xl border border-ink-line bg-bg-1 px-7 py-5 text-sm">
        {result.orderName && (
          <Row label="주문" value={result.orderName} />
        )}
        {result.method && <Row label="결제수단" value={result.method} />}
        {typeof result.totalAmount === "number" && (
          <Row label="결제금액" value={formatKRW(result.totalAmount)} />
        )}
      </dl>
      <Link
        href="/"
        className="mt-10 inline-block rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
      >
        홈으로
      </Link>
    </Centered>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-8 border-b border-ink-line pb-2.5 last:border-b-0 last:pb-0">
      <dt className="shrink-0 text-ink-mute">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}

function Centered({
  title,
  children,
  tone = "default",
  titleClassName = "text-4xl",
}: {
  title: string;
  children?: React.ReactNode;
  tone?: "default" | "error";
  titleClassName?: string;
}) {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-bg-2 px-6 text-center"
    >
      <h1
        className={`font-display font-light ${titleClassName} ${
          tone === "error" ? "text-burg-400" : "text-ink"
        }`}
      >
        {title}
      </h1>
      {children}
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<Centered title="결제를 확인하고 있습니다…" />}>
      <SuccessInner />
    </Suspense>
  );
}
