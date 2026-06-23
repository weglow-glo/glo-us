import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Public "도움됐나요?" vote. POST { id, dir: 'up'|'down', add: boolean }
 * → atomic ±1 via the vote_review_helpful RPC → { helpful_up, helpful_down }.
 * Per-device dedup is enforced on the client (localStorage); the RPC clamps to ±1.
 */
export async function POST(request: Request) {
  let body: { id?: unknown; dir?: unknown; add?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const { id, dir, add } = body;
  if (
    typeof id !== "string" ||
    (dir !== "up" && dir !== "down") ||
    typeof add !== "boolean"
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vote_review_helpful", {
    rid: id,
    dir,
    add,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    helpful_up: row?.helpful_up ?? 0,
    helpful_down: row?.helpful_down ?? 0,
  });
}
