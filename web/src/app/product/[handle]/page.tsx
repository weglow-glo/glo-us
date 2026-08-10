import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchPublicRound } from "@/lib/groupbuy-server";
import { type PublicRound } from "@/lib/groupbuy";
// 생성된 마케팅 상세페이지를 그대로 재사용한다 — predev/prebuild 가
// ko/product.html 에서 생성하므로 빌드 시점에는 항상 존재한다 (gitignored).
import MarketingLayout from "../../(marketing)/layout";
import ProductPage from "../../(marketing)/product/page";
import RoundBuyPatch from "./_round-patch";

/**
 * /product/@{handle} — 공구·협찬 전용 상세페이지.
 * 일반 상세페이지와 완전히 동일하게 보이고, 단가표(옵션·가격·구매 링크)만
 * 회차 전용 구성으로 바뀐다 (RoundBuyPatch).
 *
 * 핸들이 없거나, 미승인이거나, 기간 밖이면 일반 /product 로 보낸다 —
 * 기존 판매 채널은 이 라우트의 존재에 영향받지 않는다.
 */

export const dynamic = "force-dynamic";

function normalizeHandle(raw: string): string | null {
  const decoded = decodeURIComponent(raw);
  if (!decoded.startsWith("@")) return null;
  const h = decoded.slice(1).trim().toLowerCase();
  return /^[a-z0-9-]{2,40}$/.test(h) ? h : null;
}

async function resolveRound(rawHandle: string): Promise<PublicRound | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle) return null;
  // fetchPublicRound 는 "지금 진행 중인" 회차만 돌려준다 —
  // 시작 전·종료 후·미승인은 null → 일반 상세페이지로 리다이렉트.
  return fetchPublicRound(handle);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const round = await resolveRound(handle);
  return {
    title: round
      ? `${round.displayName ?? "셀러"} × glo 프로모션 — GL-01 최대 혜택가`
      : "glo GL-01",
    robots: { index: false, follow: false },
  };
}

export default async function SellerRoundPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const round = await resolveRound(handle);
  if (!round) redirect("/product");

  return (
    <MarketingLayout>
      <ProductPage />
      <RoundBuyPatch round={round} />
    </MarketingLayout>
  );
}
