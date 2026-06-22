import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLUMNS = "author_name, location, rating, body, helpful_up, helpful_down, review_date";
const MAX_LIMIT = 24;

/**
 * Public, paginated product reviews (체험단 후기).
 * GET /api/reviews?offset=0&limit=8&sort=rating_desc&q=수분
 *   → { reviews, total, hasMore }
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(url.searchParams.get("limit")) || 8));
  const sort = url.searchParams.get("sort") ?? "rating_desc";
  const q = url.searchParams.get("q")?.trim();

  const supabase = await createClient();
  let query = supabase.from("reviews").select(COLUMNS, { count: "exact" });

  if (q) query = query.ilike("body", `%${q}%`);

  // Ordering. Secondary key keeps pages stable.
  if (sort === "recent") {
    query = query.order("review_date", { ascending: false });
  } else if (sort === "helpful") {
    query = query
      .order("helpful_up", { ascending: false })
      .order("review_date", { ascending: false });
  } else {
    // rating_desc (default)
    query = query
      .order("rating", { ascending: false })
      .order("review_date", { ascending: false });
  }

  // Stable tiebreaker — without a unique final sort key, offset pagination over
  // tied rows (same rating/date) can repeat or skip rows across pages.
  query = query.order("id", { ascending: true });

  const { data, count, error } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    reviews: data ?? [],
    total,
    hasMore: offset + (data?.length ?? 0) < total,
  });
}
