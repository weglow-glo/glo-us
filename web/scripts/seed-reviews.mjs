// Seed 753 체험단 reviews into Supabase (matches the displayed 4.8 / distribution).
// Requires the `reviews` table (migration 0005). Run from repo root:
//   node web/scripts/seed-reviews.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- env (parse web/.env.local) ----------------------------------
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in web/.env.local");
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

// --- generators --------------------------------------------------
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

const SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문손배백허유남심노하".split("");
const LOCS = [
  "서울","서울","서울","서울","경기","경기","인천","부산","대구","대전",
  "광주","수원","성남","용인","고양","창원","청주","전주","천안","제주",
];

const POS_OPEN = ["3주차쯤부터","한 달 넘게 먹으니","8주차에 접어드니","꾸준히 챙겨 먹었더니","아침마다 한 포씩 먹었더니","두 달 정도 지나니","환절기에 먹기 시작했는데"];
const POS_EFFECT = ["피부 결이 확실히 매끈해졌어요","수분감이 먼저 올라왔어요","톤이 한결 균일해졌어요","탄력이 달라진 게 느껴져요","화장이 들뜨지 않아요","피부가 안에서부터 차오르는 느낌이에요","칙칙하던 게 환해졌어요","장벽이 단단해진 느낌이에요"];
const POS_CLOSE = ["주변에서 피부 좋아졌다고 자주 물어봐요.","파인애플 향이라 부담 없이 매일 먹게 돼요.","성분이랑 용량이 다 공개돼 있어서 믿고 먹어요.","재구매 의사 100%입니다.","과장 없이 딱 말한 대로라 신뢰가 가요.","이제 데일리 루틴에서 못 빼요.","작은 사이즈라 챙겨 먹기 편해요."];

const MID_OPEN = ["드라마틱하진 않지만","효과는 천천히 오지만","기대보다 시간은 걸렸지만","처음 2주는 잘 몰랐는데"];
const MID_CLOSE = ["꾸준함이 관건인 것 같아요.","가격대는 살짝 있지만 만족해요.","전반적으로는 만족합니다.","향이 좋아서 계속 먹게 되네요."];

const NEU = ["아직은 큰 변화를 모르겠어요. 조금 더 먹어보고 판단하려구요.","사람마다 다른 것 같아요. 향은 좋아서 먹기는 편해요.","두 달째인데 변화가 미미한 편이에요.","나쁘지 않은데 드라마틱한 변화는 아직이에요."];
const NEG2 = ["저한테는 큰 효과가 없었어요. 향은 괜찮은데 체감은 글쎄요.","기대가 컸나 봐요. 두 달 먹었는데 체감이 약하네요.","맞는 분도 있겠지만 저한테는 아니었어요."];
const NEG1 = ["저는 효과를 못 느꼈어요. 그래도 성분 공개는 좋았습니다.","제 피부엔 안 맞았어요. 아쉽게 재구매는 안 할 것 같아요."];

function body(rating) {
  if (rating === 5) return `${rnd(POS_OPEN)} ${rnd(POS_EFFECT)}. ${rnd(POS_CLOSE)}`;
  if (rating === 4) return `${rnd(MID_OPEN)} ${rnd(POS_EFFECT)}. ${rnd(MID_CLOSE)}`;
  if (rating === 3) return rnd(NEU);
  if (rating === 2) return rnd(NEG2);
  return rnd(NEG1);
}
function helpful(rating) {
  const up = { 5: [3, 26], 4: [2, 15], 3: [1, 8], 2: [0, 5], 1: [0, 4] }[rating];
  const down = rating >= 4 ? rint(0, 1) : rint(0, 3);
  return { up: rint(up[0], up[1]), down };
}
function randomDate() {
  // 2025-12-01 .. 2026-04-30
  const start = Date.UTC(2025, 11, 1);
  const end = Date.UTC(2026, 3, 30);
  const t = start + Math.floor(Math.random() * (end - start));
  return new Date(t).toISOString().slice(0, 10);
}

const DIST = { 5: 671, 4: 60, 3: 13, 2: 4, 1: 5 }; // total 753, avg ≈ 4.8

const rows = [];
for (const [rating, n] of Object.entries(DIST)) {
  for (let i = 0; i < n; i++) {
    const r = Number(rating);
    const { up, down } = helpful(r);
    rows.push({
      author_name: `${rnd(SURNAMES)} OO`,
      location: rnd(LOCS),
      rating: r,
      body: body(r),
      helpful_up: up,
      helpful_down: down,
      review_date: randomDate(),
    });
  }
}
// shuffle so dates/ratings interleave
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]];
}

// --- insert ------------------------------------------------------
const { error: delErr } = await db.from("reviews").delete().neq("id", "00000000-0000-0000-0000-000000000000");
if (delErr) {
  console.error("Pre-clean failed (table missing? run migration 0005 first):", delErr.message);
  process.exit(1);
}
let inserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const { error } = await db.from("reviews").insert(batch);
  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }
  inserted += batch.length;
  console.log(`inserted ${inserted}/${rows.length}`);
}
const { count } = await db.from("reviews").select("id", { count: "exact", head: true });
console.log(`✓ done. reviews in table: ${count}`);
