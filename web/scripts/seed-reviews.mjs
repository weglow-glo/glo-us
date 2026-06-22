// Seed 753 체험단 reviews into Supabase (matches the displayed 4.8 / distribution).
// Requires the `reviews` table (migration 0005). Run from repo root:
//   node web/scripts/seed-reviews.mjs
//
// Bodies are assembled combinationally (situation + result + closer, polite OR
// casual) and de-duplicated, so no two reviews are identical and any keyword
// filter returns varied phrasing.
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

// --- helpers -----------------------------------------------------
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const rint = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const chance = (p) => Math.random() < p;

const SURNAMES = "김이박최정강조윤장임한오서신권황안송류전홍고문손배백허유남심노하구마진".split("");
const LOCS = [
  "서울","서울","서울","서울","경기","경기","인천","부산","대구","대전",
  "광주","수원","성남","용인","고양","창원","청주","전주","천안","제주","울산","김해",
];

// ---- 존댓말 조립 부품 -------------------------------------------
const SIT = [
  "30대 중반 넘어가면서","마흔을 앞두고","둘째 낳고 푸석해진 피부 때문에","갱년기 들어 피부가 처지는 게 느껴져서",
  "야근이 잦은 직업이라 늘 칙칙했는데","시술은 무서워 미루던 차에","콜라겐 가루는 비려서 못 먹었는데","이것저것 먹어도 효과가 없던 차에",
  "결혼 준비하면서","환절기만 되면 뒤집어지던 피부였는데","출산 후 호르몬 때문인지 칙칙해서","종일 모니터 앞에 앉아있는 직업이라",
  "자외선 많이 받는 일을 해서","피부과를 다녀도 그때뿐이라","40대 들어 탄력이 훅 떨어진 게 느껴져서","건조해서 각질이 잘 일어나는 편인데",
  "화장이 자꾸 들뜨길래","친구 추천으로 반신반의하며 시작했는데","큰 기대 없이 먹기 시작했는데","미백 제품은 효과를 못 봐서 포기했었는데",
  "모공이 점점 넓어지는 것 같아서","생기 없어 보인다는 말을 자주 들어서","나이 들수록 푸석해지는 게 싫어서","피곤이 얼굴에 다 드러나는 편인데",
  "색조가 안 먹어서 고민이었는데","30대 후반부터 부쩍 처지는 느낌이라","환절기 건조함이 심해서","잠이 부족한 날이 많아서",
  "운동만으론 피부까지는 안 되더라구요, 그래서","피부 톤이 어둡다는 게 콤플렉스였는데","수험생 엄마라 늘 피곤했는데","갱년기라 그런지 부쩍 늙어보여서",
];
const TL = ["1주차부터","2주쯤 지나니","3주차에","한 달쯤 되니","6주차 즈음","두 달 넘기니","8주차에 접어드니","꾸준히 먹었더니","한 통 다 먹을 때쯤","12주 정도 되니","생각보다 빨리"];

// 결과 — 테마별 조각 조합으로 거의 유니크하게 생성
const HYD_LEAD = ["속건조가","건조함이","당김이","푸석함이","세안 후 당김이","환절기 건조함이","속당김이"];
const HYD_BODY = ["사라지고 속부터 촉촉해요","잡혀서 하루 종일 촉촉해요","줄고 수분감이 꽉 차요","없어지고 촉촉함이 오래가요","가시고 물광이 돌아요","사라지고 수분으로 채워지는 느낌이에요","줄어들고 안에서부터 촉촉해요"];
const HYD_SOLO = ["수분감이 확 올라오네요","눈에 띄게 촉촉해졌어요","겉은 보송한데 속은 촉촉해요","화장 안 해도 수분감이 있어 물광이 나요","아침에 얼굴 당기던 게 없어졌어요","피부가 수분으로 채워지는 느낌이에요","속부터 촉촉하게 차오르는 느낌이에요","물 먹은 것처럼 촉촉해졌어요"];
const TONE = ["톤이 한 톤 밝아졌어요","칙칙함이 가시고 화사해졌어요","어둡던 안색이 살아났어요","한 꺼풀 벗은 듯 맑아졌어요","잡티가 옅어진 게 보여요","화사하고 투명한 느낌이 들어요","안색이 밝아졌다는 소릴 들어요","피부가 한 톤 맑아진 느낌이에요","칙칙함이 사라져 환해졌어요"];
const ELAS = ["탄력이 생겨 처짐이 덜해졌어요","볼 라인이 탄탄해진 느낌이에요","처지던 게 좀 올라온 것 같아요","탱글탱글해진 느낌이에요","안에서부터 단단해진 느낌이에요","늘어졌던 볼이 좀 올라왔어요"];
const TEX = ["결이 매끈해졌어요","각질이 덜 일어나요","피부결이 정돈됐어요","거칠던 볼이 부드러워졌어요","손이 자꾸 갈 만큼 매끈해졌어요","오돌토돌하던 게 매끈해졌어요"];
const MISC = ["화장이 안 들뜨고 잘 먹어요","모공이 조금 줄어든 느낌이에요","트러블이 확실히 줄었어요","아침에 부기가 덜해요","컨디션 안 좋은 날에도 얼굴이 안 죽어요","화장 지속력이 좋아졌어요","메이크업 없이도 화사해 보여요","피부가 속부터 건강해지는 느낌이에요"];
function resP() {
  const r = Math.random();
  if (r < 0.30) return chance(0.7) ? `${rnd(HYD_LEAD)} ${rnd(HYD_BODY)}` : rnd(HYD_SOLO);
  if (r < 0.52) return rnd(TONE);
  if (r < 0.70) return rnd(ELAS);
  if (r < 0.84) return rnd(TEX);
  return rnd(MISC);
}
const CLOSE = [
  "재구매 확정이에요.","이제 루틴에서 못 빼요.","파인애플 맛이라 부담 없이 매일 먹어요.","향이 좋아서 챙겨 먹게 돼요.",
  "성분이랑 용량 다 공개돼 있어서 믿음이 가요.","과장 없이 솔직한 게 더 신뢰돼요.","주변에 추천했어요.","엄마 것도 같이 주문했어요.",
  "친구가 뭐 쓰냐고 물어봤어요.","시술 안 받길 잘했다 싶어요.","비싼 앰플보다 이게 나아요.","꾸준히 먹을 생각이에요.",
  "스틱이라 휴대가 편해요.","물 없이 먹을 수 있어 좋아요.","가격값은 한다고 생각해요.","다른 콜라겐이랑은 확실히 달라요.",
  "남편도 같이 먹기 시작했어요.","선물용으로도 좋을 것 같아요.","꾸준함이 답인 것 같아요.","효과 보고 정기로 바꿨어요.",
  "피부과 비용 아끼는 셈이에요.","진작 먹을 걸 그랬어요.","기대 이상이라 놀랐어요.","반신반의했는데 인정합니다.",
  "사진으로도 차이가 보여요.","다음엔 더 길게 주문하려구요.","아침저녁 챙기는 재미가 있어요.","6개월은 먹어보려구요.",
];
const CAVEAT = ["드라마틱하진 않지만","큰 변화는 아니어도","처음엔 반신반의했는데","효과가 빠르진 않아도","엄청난 변화는 아니지만"];
const CLOSE4 = ["전반적으로 만족해요.","꾸준히 먹어볼게요.","가격은 좀 있지만 만족해요.","천천히 더 지켜볼게요.","무난하게 잘 먹고 있어요.", ...CLOSE.slice(0, 8)];

function politeBody() {
  const r = Math.random();
  const res = resP();
  if (r < 0.30) return `${rnd(SIT)}, ${chance(0.5) ? rnd(TL) + " " : ""}${res}. ${rnd(CLOSE)}`;
  if (r < 0.52) return `${rnd(TL)} ${res}. ${rnd(CLOSE)}`;
  if (r < 0.74) { let r2 = resP(); return `${rnd(SIT)}, ${res}.${r2 !== res ? ` ${r2}.` : ""} ${rnd(CLOSE)}`; }
  if (r < 0.90) return `${res}. ${rnd(CLOSE)}`;
  return `${rnd(SIT)}, ${res}.`;
}

// ---- 반말·구어체 조립 부품 --------------------------------------
const C_OPEN = ["","와 ","ㄹㅇ ","솔직히 ","요즘 ","3주쯤 되니까 ","한 달 먹으니까 ","두 달째인데 ","꾸준히 먹으니까 ","처음엔 의심했는데 ","아 이거 ","진짜 "];
const C_CLOSE = ["강추ㅎㅎ","재구매 ㄱㄱ","못 끊겠어ㅋㅋ","진심 만족.","이거 물건이야.","계속 먹을 듯.","인정.","신기함ㅎㅎ","사길 잘했어.","믿고 먹는 중.","ㅋㅋ 인생템.","후회 없음."];
// 반말 결과도 조각 조합 (수분만 35가지 등)
const CH_LEAD = ["속건조 잡혀서 ","당김 없어지고 ","건조했는데 ","세수하고 안 당기고 ","푸석함 없어지고 ",""];
const CH_GAIN = ["촉촉해","수분감 꽉 차","수분 차오르는 느낌이야","물광 올라옴","수분감 살아남","속부터 촉촉해짐","하루종일 촉촉해"];
const C_TONE = ["톤 올라온 게 보여","칙칙함이 가심","안색 밝아짐","한 톤 맑아진 느낌이야","화사해졌다는 말 들음","잡티 옅어진 거 보임","피부 환해짐"];
const C_ELAS = ["탱탱함이 살아남","처짐이 덜해졌어","탄력 생긴 느낌이야","볼이 좀 올라온 듯","피부가 단단해진 느낌"];
const C_TEX = ["결 진짜 매끈해졌어","각질 덜 일어나","피부 부드러워졌어","결 정돈된 느낌이야","손 자꾸 가ㅎㅎ"];
const C_MISC = ["화장이 안 떠","모공 줄어든 느낌이야","부기 덜해","피부가 좀 사는 느낌이야","화장 잘 먹어","컨디션 안 좋아도 얼굴 안 죽어","트러블 줄었어"];
function casualRes() {
  const r = Math.random();
  if (r < 0.30) return `${rnd(CH_LEAD)}${rnd(CH_GAIN)}`;
  if (r < 0.52) return rnd(C_TONE);
  if (r < 0.70) return rnd(C_ELAS);
  if (r < 0.84) return rnd(C_TEX);
  return rnd(C_MISC);
}
function casualBody() {
  return `${rnd(C_OPEN)}${casualRes()}. ${rnd(C_CLOSE)}`;
}
const CASUAL4_OPEN = ["드라마틱하진 않은데 ","큰 변화까진 아니어도 ","효과 빠르진 않아도 ","아직 확신은 없지만 ","천천히 보는 중인데 "];
const CASUAL4_RES = ["결은 좀 부드러워진 듯","톤은 살짝 올라온 것 같아","꾸준히 먹을 만은 해","나쁘진 않아","수분감은 좀 느껴져"];
const CASUAL4_CLOSE = ["ㅎㅎ 계속 먹어보려고.","그래도 만족하는 편.","좀 더 지켜볼게.","가격은 좀 있지만 ㅇㅋ.","무난해."];
function casual4Body() {
  return `${rnd(CASUAL4_OPEN)}${rnd(CASUAL4_RES)}. ${rnd(CASUAL4_CLOSE)}`;
}
function pos4() {
  return `${rnd(CAVEAT)} ${resP()}. ${rnd(CLOSE4)}`;
}

// ---- 중립/부정 (수 적음) ---------------------------------------
const NEU = [
  "아직은 큰 변화를 모르겠어요. 좀 더 먹어보려구요.","사람마다 다른가 봐요. 저는 미미한 편이에요.","향은 좋은데 효과는 아직 잘 모르겠어요.",
  "두 달째인데 드라마틱하진 않네요.","나쁘진 않은데 기대만큼은 아니에요.","보통이에요. 더 지켜봐야 할 것 같아요.",
  "수분감은 좀 느껴지는데 톤은 아직이에요.","무난해요. 부작용 없이 먹기 편해요.","절반쯤 먹었는데 판단하긴 일러요.",
  "좋다는 분 많아 기대했는데 저는 보통이에요.","피부가 예민해서 천천히 보는 중이에요.","기대가 컸나 봐요. 무난한 정도예요.","솔직히 아직 잘 모르겠어요ㅎㅎ",
];
const NEG2 = [
  "저한테는 큰 효과가 없었어요. 향은 괜찮은데요.","두 달 먹었는데 체감이 약하네요.","기대가 컸나 봐요. 저랑은 안 맞았어요.",
  "맞는 분도 있겠지만 저는 별로였어요.","가격 대비 효과는 잘 모르겠어요.","꾸준히 먹었는데도 변화가 미미해요.","향은 좋은데 효과는 아쉬워요.",
];
const NEG1 = [
  "저는 효과를 전혀 못 느꼈어요.","제 피부엔 안 맞았어요. 아쉽네요.","기대했는데 변화가 없어 실망이에요.",
  "다 먹었는데 잘 모르겠어요.","저한텐 그냥 그랬어요. 재구매는 안 해요.","광고만큼은 아니었어요.",
];

function body(rating) {
  if (rating === 5) return chance(0.55) ? politeBody() : casualBody();
  if (rating === 4) return chance(0.3) ? casual4Body() : pos4();
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
  const start = Date.UTC(2025, 11, 1);
  const end = Date.UTC(2026, 3, 30);
  const t = start + Math.floor(Math.random() * (end - start));
  return new Date(t).toISOString().slice(0, 10);
}

const DIST = { 5: 671, 4: 60, 3: 13, 2: 4, 1: 5 }; // total 753, avg ≈ 4.8

// Unique-body generator: never emit the same body twice.
const seen = new Set();
function uniqueBody(rating) {
  for (let t = 0; t < 200; t++) {
    const b = body(rating);
    if (!seen.has(b)) { seen.add(b); return b; }
  }
  // extremely unlikely fallback — make it unique with a soft suffix
  let i = 2, b = body(rating);
  while (seen.has(`${b} (${i})`)) i++;
  const out = `${b} (${i})`;
  seen.add(out);
  return out;
}

const rows = [];
for (const [rating, n] of Object.entries(DIST)) {
  for (let i = 0; i < n; i++) {
    const r = Number(rating);
    const { up, down } = helpful(r);
    rows.push({
      author_name: `${rnd(SURNAMES)} OO`,
      location: rnd(LOCS),
      rating: r,
      body: uniqueBody(r),
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
