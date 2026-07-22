import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveMedia, rejectMedia, toggleHidden, deleteReview } from "./actions";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "media", label: "미디어 검수 대기" },
  { key: "all", label: "전체 고객 리뷰" },
  { key: "hidden", label: "숨김" },
];

type Row = {
  id: string;
  order_id: string | null;
  author_name: string;
  location: string | null;
  rating: number;
  body: string;
  photos: string[];
  videos: string[];
  status: string;
  media_status: string;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/**
 * 고객 리뷰 운영 (docs/review-policy.md).
 * 텍스트는 즉시 게시되므로 여기서는 ① 사진·영상 검수(승인 시 +2,000P)와
 * ② 정책 위반 리뷰 숨김·삭제만 처리한다.
 */
export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const filter = FILTERS.some((f) => f.key === tab) ? String(tab) : "media";

  const admin = createAdminClient();
  let query = admin
    .from("reviews")
    .select("id, order_id, author_name, location, rating, body, photos, videos, status, media_status, created_at")
    .eq("source", "customer");
  if (filter === "media") query = query.eq("media_status", "pending");
  if (filter === "hidden") query = query.eq("status", "hidden");
  const { data } = await query
    .order("created_at", { ascending: filter === "media" })
    .limit(100)
    .returns<Row[]>();
  const rows = data ?? [];

  const { count: mediaPending } = await admin
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("source", "customer")
    .eq("media_status", "pending");

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-sans text-3xl font-light text-ink">
        리뷰 관리{" "}
        <span className="text-sm text-ink-mute">(미디어 검수 대기 {mediaPending ?? 0}건)</span>
      </h1>

      <div className="mt-6 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/reviews?tab=${f.key}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              filter === f.key
                ? "border-accent bg-accent text-cream"
                : "border-ink-line text-ink-soft hover:border-accent"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <p className="mt-4 rounded-xl border border-burg-50 bg-bg-3 px-5 py-3 text-xs leading-relaxed text-ink-soft">
        <b className="text-ink">검수 기준</b> — 효능·질병 표현(미백/주름/기미 개선, 치료 등)이
        드러나는 미디어·텍스트는 게시 불가(반려·숨김). 얼굴·개인정보 과다 노출 미디어도 반려.
        <b className="ml-1">별점이 낮다는 이유로 숨기면 안 됩니다</b>(전자상거래법).
      </p>

      <div className="mt-6 space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-ink-line bg-bg-1 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-sm text-ink">
                <b>{r.author_name}</b>
                {r.location ? ` · ${r.location}` : ""} ·{" "}
                <span className="text-accent">{"★".repeat(r.rating)}</span>
                <span className="text-ink-line">{"★".repeat(5 - r.rating)}</span>
                {r.status === "hidden" && (
                  <span className="ml-2 rounded-full bg-bg-3 px-2 py-0.5 text-xs text-burg-400">
                    숨김
                  </span>
                )}
                {r.media_status === "pending" && (
                  <span className="ml-2 rounded-full bg-bg-3 px-2 py-0.5 text-xs text-ink-mute">
                    미디어 검수 대기
                  </span>
                )}
                {r.media_status === "rejected" && (
                  <span className="ml-2 rounded-full bg-bg-3 px-2 py-0.5 text-xs text-ink-mute">
                    미디어 반려됨
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-faint">
                {fmtDate(r.created_at)}
                {r.order_id && <span className="ml-2 font-mono">{r.order_id}</span>}
              </div>
            </div>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
              {r.body}
            </p>

            {(r.photos?.length > 0 || r.videos?.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {r.photos?.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt={`리뷰 사진 ${i + 1}`}
                      className="h-24 w-24 rounded-lg border border-ink-line object-cover"
                    />
                  </a>
                ))}
                {r.videos?.map((u) => (
                  <video
                    key={u}
                    src={u}
                    controls
                    preload="metadata"
                    className="h-24 rounded-lg border border-ink-line"
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-line pt-4">
              {r.media_status === "pending" && (
                <>
                  <form action={approveMedia}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-full bg-burg-600 px-5 py-2 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
                      미디어 승인 (+2,000P)
                    </button>
                  </form>
                  <form action={rejectMedia}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="rounded-full border border-burg-600 px-5 py-2 text-sm font-semibold text-burg-600 transition hover:bg-burg-600 hover:text-bg-1">
                      미디어 반려
                    </button>
                  </form>
                </>
              )}
              <form action={toggleHidden}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="to" value={r.status === "hidden" ? "approved" : "hidden"} />
                <button className="rounded-full border border-ink-line px-5 py-2 text-sm text-ink-soft transition hover:border-accent">
                  {r.status === "hidden" ? "숨김 해제" : "리뷰 숨김"}
                </button>
              </form>
              <form action={deleteReview}>
                <input type="hidden" name="id" value={r.id} />
                <button className="rounded-full border border-ink-line px-5 py-2 text-sm text-ink-mute transition hover:border-burg-400 hover:text-burg-400">
                  삭제
                </button>
              </form>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="rounded-xl border border-ink-line bg-bg-2 py-14 text-center text-sm text-ink-mute">
            해당 리뷰가 없습니다.
          </div>
        )}
      </div>
    </main>
  );
}
