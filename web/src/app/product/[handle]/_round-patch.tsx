"use client";

import { useEffect } from "react";
import {
  roundDiscountOf,
  roundRegularOf,
  type PublicRound,
} from "@/lib/groupbuy";
import { formatKRW } from "@/lib/product";

/** 브랜드 규칙 — `glo` 단어는 항상 Fraunces 로 */
function gloWord(): HTMLElement {
  const s = document.createElement("span");
  s.style.fontFamily = "'Fraunces', Georgia, serif";
  s.textContent = "glo";
  return s;
}

/**
 * 공구·협찬 전용 단가표 패치 — 생성된 상세페이지(#buy)를 그대로 쓰되,
 * 옵션 버튼과 구매 링크만 회차 전용가로 갈아끼운다.
 *
 * 원본 .opt 버튼을 제거하므로 _interactions.tsx 가 걸어둔 클릭 핸들러는
 * 노드와 함께 사라진다. 선택 동작은 여기서 동일하게 다시 구현한다.
 * 런칭 이벤트 카운트다운(#launch-scar)은 공구와 무관하므로 제거하고,
 * 마감 시 가격을 덮어쓰는 applyPostPricing 에 대비해 data-post-price 를
 * 회차 가격과 동일하게 박아 어떤 경로로도 가격이 바뀌지 않게 한다.
 */
export default function RoundBuyPatch({ round }: { round: PublicRound }) {
  useEffect(() => {
    const optList = document.querySelector<HTMLElement>("#buy .opt-list");
    const buyBtn = document.getElementById("buy-btn") as HTMLAnchorElement | null;
    const buyFloatBtn = document.getElementById("buy-float-btn") as HTMLAnchorElement | null;
    const buyFloatPrice = document.getElementById("buy-float-price");
    if (!optList || !buyBtn) return;

    const checkoutHref = (key: string) =>
      `/checkout?option=${encodeURIComponent(key)}&round=${encodeURIComponent(round.handle)}`;

    const sellerName = round.displayName ?? "셀러";
    const maxDisc = Math.round(Math.max(...round.options.map(roundDiscountOf)));
    const endsAt = round.endsAt ? new Date(round.endsAt) : null;
    const endLabel = endsAt
      ? endsAt.toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "long",
          day: "numeric",
        })
      : "";

    // 1) 런칭 이벤트 카운트다운 제거 → 프로모션 안내 바로 교체
    document.getElementById("launch-scar")?.remove();
    const buyBox = optList.closest<HTMLElement>(".buy-box");
    let banner: HTMLElement | null = null;
    if (buyBox && !buyBox.querySelector("[data-round-banner]")) {
      banner = document.createElement("div");
      banner.setAttribute("data-round-banner", "");
      banner.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;gap:8px;" +
        "padding:12px 16px;margin-bottom:14px;border-radius:10px;" +
        "background:var(--bg-3);border:1px solid var(--burg-50);";
      const left = document.createElement("span");
      left.style.cssText = "font-size:13px;font-weight:700;color:var(--accent);";
      left.append(`${sellerName}님 × `, gloWord(), " 프로모션 최대 혜택가");
      const right = document.createElement("span");
      right.style.cssText = "font-size:12px;color:var(--ink-soft);";
      right.textContent = endLabel ? `${endLabel} 마감` : "";
      banner.append(left, right);
      buyBox.prepend(banner);
    }

    // 1.5) 하단 대형 배너(po-banner) — "공식 런칭 기념" → 셀러 프로모션 문구.
    //     _interactions 의 이벤트 마감 스왑(10만 포 스토리)이 먼저 돌아도
    //     이 패치가 뒤에 실행되므로 최종 문구는 항상 프로모션 버전이 된다.
    {
      const ey = document.querySelector<HTMLElement>(".po-banner .ey");
      if (ey) {
        ey.textContent = "";
        const dash = document.createElement("span");
        dash.className = "dash";
        ey.append(dash, `${sellerName}님 × `, gloWord(), " 프로모션");
      }
      const h = document.querySelector<HTMLElement>(".po-banner-h");
      if (h) {
        h.textContent = "";
        const em = document.createElement("em");
        em.textContent = `최대 ${maxDisc}% 혜택가`;
        h.append(`${sellerName}님 팔로워 전용,`, document.createElement("br"), em);
      }
      const num = document.querySelector<HTMLElement>(".po-banner-num");
      if (num) {
        num.textContent = "";
        const pct = document.createElement("span");
        pct.className = "po-banner-pct";
        pct.textContent = "%";
        num.append(String(maxDisc), pct);
      }
      const sub = document.querySelector<HTMLElement>(".po-banner-sub");
      if (sub) {
        sub.textContent =
          `${sellerName}님을 통해서만 열리는 프로모션 가격입니다. ` +
          "이 페이지에서 구매해야 혜택가가 적용됩니다.";
      }
      const dl = document.querySelector<HTMLElement>(".po-banner-dl");
      if (dl) {
        dl.textContent = "";
        if (endLabel) {
          const b = document.createElement("b");
          b.textContent = endLabel;
          dl.append("프로모션은 ", b, "에 마감되며, 이후 일반 판매가로 전환됩니다.");
        } else {
          dl.remove();
        }
      }
    }

    // 2) 옵션 버튼을 회차 전용 구성으로 교체 (원본과 동일한 마크업 구조)
    const originals = [...optList.querySelectorAll<HTMLElement>(".opt")];
    originals.forEach((o) => o.remove());

    const handlers: Array<[HTMLElement, () => void]> = [];
    const cards = round.options.map((o, idx) => {
      const price = formatKRW(o.price);
      const disc = `-${Math.round(roundDiscountOf(o))}%`;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `opt${idx === 0 ? " active" : ""}`;
      btn.dataset.key = o.key;
      btn.dataset.postPrice = price; // 이벤트 마감 스왑이 돌아도 가격 불변
      btn.dataset.postDisc = disc;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", idx === 0 ? "true" : "false");

      const name = document.createElement("span");
      name.className = "opt-name";
      name.textContent = o.label;
      if (o.badge) {
        const em = document.createElement("em");
        em.textContent = o.badge;
        name.append(" ", em);
      }

      const right = document.createElement("span");
      right.className = "opt-right";
      const prices = document.createElement("span");
      prices.className = "opt-prices";
      const was = document.createElement("s");
      was.className = "opt-was";
      was.textContent = formatKRW(roundRegularOf(o));
      const priceEl = document.createElement("span");
      priceEl.className = "opt-price";
      priceEl.textContent = price;
      prices.append(was, priceEl);
      const discEl = document.createElement("span");
      discEl.className = "opt-disc";
      discEl.textContent = disc;
      right.append(prices, discEl);

      btn.append(name, right);
      optList.appendChild(btn);
      return btn;
    });

    const select = (btn: HTMLElement) => {
      cards.forEach((c) => {
        c.classList.remove("active");
        c.setAttribute("aria-checked", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-checked", "true");
      const key = btn.dataset.key ?? round.options[0].key;
      const price = btn.querySelector<HTMLElement>(".opt-price")?.textContent ?? "";
      buyBtn.href = checkoutHref(key);
      if (buyFloatBtn) buyFloatBtn.href = checkoutHref(key);
      if (buyFloatPrice && price) buyFloatPrice.textContent = price;
    };

    cards.forEach((btn) => {
      const h = () => select(btn);
      btn.addEventListener("click", h);
      handlers.push([btn, h]);
    });
    if (cards[0]) select(cards[0]);

    return () => {
      handlers.forEach(([el, h]) => el.removeEventListener("click", h));
      banner?.remove();
    };
  }, [round]);

  return null;
}
