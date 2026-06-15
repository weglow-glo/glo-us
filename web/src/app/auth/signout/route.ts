import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign out server-side so the (possibly httpOnly) auth cookies are cleared.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
