import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADDRESS_COLUMNS, type Address } from "@/lib/address";

export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** List the signed-in user's saved addresses (default first, then newest). */
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ addresses: [] });

  const { data } = await supabase
    .from("shipping_addresses")
    .select(ADDRESS_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<Address[]>();

  return NextResponse.json({ addresses: data ?? [] });
}

/** Add a new address. Becomes default if it's the first one or makeDefault=true. */
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: {
    recipient?: string;
    phone?: string;
    postcode?: string;
    address?: string;
    detail?: string;
    memo?: string;
    makeDefault?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipient = body.recipient?.trim();
  const phone = body.phone?.trim();
  const address = body.address?.trim();
  if (!recipient || !phone || !address) {
    return NextResponse.json(
      { error: "수령인, 연락처, 주소는 필수입니다." },
      { status: 400 },
    );
  }

  const { count } = await supabase
    .from("shipping_addresses")
    .select("id", { count: "exact", head: true });
  const makeDefault = body.makeDefault || (count ?? 0) === 0;

  if (makeDefault) {
    await supabase
      .from("shipping_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id);
  }

  const { data, error } = await supabase
    .from("shipping_addresses")
    .insert({
      user_id: user.id,
      recipient,
      phone,
      postcode: body.postcode?.trim() || null,
      address,
      detail: body.detail?.trim() || null,
      memo: body.memo?.trim() || null,
      is_default: makeDefault,
    })
    .select(ADDRESS_COLUMNS)
    .single<Address>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ address: data });
}

/** Set an address as the default (unsets the others first). */
export async function PATCH(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id는 필수입니다." }, { status: 400 });

  await supabase
    .from("shipping_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("shipping_addresses")
    .update({ is_default: true })
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Delete an address. */
export async function DELETE(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id는 필수입니다." }, { status: 400 });

  const { error } = await supabase
    .from("shipping_addresses")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
