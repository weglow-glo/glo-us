"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatKRW } from "@/lib/product";
import { metaTrack } from "@/lib/meta";
import { naverPurchase } from "@/lib/naver-cts";

type VirtualAccount = {
  bankCode?: string;
  accountNumber?: string;
  dueDate?: string;
  customerName?: string;
};

type Result =
  | { state: "loading" }
  | { state: "ok"; orderName?: string; method?: string; totalAmount?: number }
  | {
      state: "awaiting";
      orderName?: string;
      totalAmount?: number;
      virtualAccount: VirtualAccount | null;
    }
  | { state: "error"; message: string };

const BANK_NAME: Record<string, string> = {
  "02": "KDB산업은행", "03": "IBK기업은행", "04": "KB국민은행", "07": "Sh수협은행",
  "11": "NH농협은행", "20": "우리은행", "23": "SC제일은행", "27": "씨티은행",
  "31": "대구은행", "32": "부산은행", "34": "광주은행", "35": "제주은행",
  "37": "전북은행", "39": "경남은행", "45": "새마을금고", "48": "신협",
  "71": "우체국", "81": "하나은행", "88": "신한은행", "89": "케이뱅크",
  "90": "카카오뱅크", "92": "토스뱅크",
};

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
        if (data.awaitingDeposit) {
          // 가상계좌 — 아직 결제 완료가 아니다. 입금 안내만 보여주고
          // Purchase 이벤트도 쏘지 않는다 (입금 확정은 웹훅이 처리).
          setResult({
            state: "awaiting",
            orderName: data.orderName,
            totalAmount: data.totalAmount,
            virtualAccount: data.virtualAccount ?? null,
          });
          return;
        }
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
        // 네이버 전환추적 구매완료 — 주문번호 기준 1회만 발화
        naverPurchase(orderId, data.totalAmount ?? amount, data.orderName);
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

  if (result.state === "awaiting") {
    const va = result.virtualAccount;
    const bank = va?.bankCode ? (BANK_NAME[va.bankCode] ?? `은행코드 ${va.bankCode}`) : null;
    const due = va?.dueDate
      ? new Date(va.dueDate).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    return (
      <Centered
        title="가상계좌가 발급되었습니다."
        titleClassName="whitespace-nowrap text-[1.45rem] sm:text-3xl"
      >
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          아래 계좌로 입금해 주시면 확인 후 배송이 시작됩니다.
        </p>
        <dl className="mx-auto mt-8 w-full max-w-sm space-y-3 rounded-xl border border-ink-line bg-bg-1 px-7 py-5 text-sm">
          {result.orderName && <Row label="주문" value={result.orderName} />}
          {bank && <Row label="입금 은행" value={bank} />}
          {va?.accountNumber && <Row label="계좌번호" value={va.accountNumber} />}
          {typeof result.totalAmount === "number" && (
            <Row label="입금 금액" value={formatKRW(result.totalAmount)} />
          )}
          {due && <Row label="입금 기한" value={due} />}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          기한 내 입금되지 않으면 주문이 자동 취소됩니다.
        </p>
        <Link
          href="/account"
          className="mt-8 inline-block rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
        >
          주문 내역 보기
        </Link>
      </Centered>
    );
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
      <p className="mt-3 font-sans text-base italic text-accent">
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
        className={`font-sans font-light ${titleClassName} ${
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
