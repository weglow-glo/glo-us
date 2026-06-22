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

const chance = (p) => Math.random() < p;

// 시작 상황(왜/언제 시작했는지)
const SIT = [
  "30대 중반 넘어가면서","마흔을 앞두고","둘째 낳고 푸석해진 피부 때문에","갱년기 들어 피부가 처지는 게 느껴져서",
  "야근이 잦은 직업이라 늘 칙칙했는데","시술은 무서워 미루던 차에","콜라겐 가루는 비려서 못 먹었는데","이것저것 먹어도 효과가 없던 차에",
  "결혼 준비하면서","환절기만 되면 뒤집어지던 피부였는데","출산 후 호르몬 때문인지 칙칙해서","종일 모니터 앞에 앉아있는 직업이라",
  "자외선 많이 받는 일을 해서","피부과를 다녀도 그때뿐이라","40대 들어 탄력이 훅 떨어진 게 느껴져서","건조해서 각질이 잘 일어나는 편인데",
  "화장이 자꾸 들뜨길래","친구 추천으로 반신반의하며 시작했는데","큰 기대 없이 먹기 시작했는데","미백 제품은 효과를 못 봐서 포기했었는데",
  "모공이 점점 넓어지는 것 같아서","생기 없어 보인다는 말을 자주 들어서","나이 들수록 푸석해지는 게 싫어서","피곤이 얼굴에 다 드러나는 편인데",
  "색조가 안 먹어서 고민이었는데","30대 후반부터 부쩍 처지는 느낌이라","환절기 건조함이 심해서","잠이 부족한 날이 많아서",
  "운동만으론 피부까지는 안 되더라구요, 그래서","피부 톤이 어둡다는 게 늘 콤플렉스였는데",
];
// 시점
const TL = ["1주차부터","2주쯤 지나니","3주차에","한 달쯤 되니","6주차 즈음","두 달 넘기니","8주차에 접어드니","꾸준히 먹었더니","한 통 다 먹을 때쯤","12주 정도 되니","생각보다 빨리","시간은 좀 걸렸지만"];
// 결과
const RES = [
  "수분감이 올라왔어요","속부터 차오르는 느낌이 들어요","피부 톤이 한 톤 밝아진 것 같아요","칙칙함이 가시고 화사해졌어요",
  "결이 매끈해져서 손이 자꾸 가요","탄력이 생겨 처짐이 덜해졌어요","화장이 안 들뜨고 잘 먹어요","잡티가 옅어진 게 보여요",
  "모공이 조금 줄어든 느낌이에요","푸석함이 사라지고 윤기가 돌아요","아침에 부기가 덜해요","속건조가 확실히 잡혔어요",
  "피부가 안에서부터 단단해진 느낌이에요","거울 볼 때마다 생기가 도는 게 느껴져요","컨디션 안 좋은 날에도 얼굴이 안 죽어요","각질이 덜 일어나요",
  "피부결이 정돈됐어요","메이크업 없이도 화사해 보여요","물광 같은 윤기가 생겼어요","트러블이 확실히 줄었어요",
  "하루 종일 촉촉함이 유지돼요","환절기에도 안 뒤집어졌어요","안색이 밝아졌다는 소릴 들어요","탱탱함이 살아나는 느낌이에요",
  "피부가 투명해 보여요","늘어졌던 볼이 좀 올라온 것 같아요","화장 지속력이 좋아졌어요","거칠던 볼이 부드러워졌어요",
  "목까지 환해졌어요","피부가 한결 매끄럽고 윤기 나요","홍조가 좀 가라앉았어요","속부터 건강해지는 느낌이에요",
];
// 마무리
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
const CLOSE4 = ["전반적으로 만족해요.","꾸준히 먹어볼게요.","가격은 좀 있지만 만족해요.","천천히 더 지켜볼게요.","무난하게 잘 먹고 있어요.", ...CLOSE.slice(0, 6)];

const NEU = [
  "아직은 큰 변화를 모르겠어요. 좀 더 먹어보려구요.","사람마다 다른가 봐요. 저는 미미한 편이에요.","향은 좋은데 효과는 아직 잘 모르겠어요.",
  "두 달째인데 드라마틱하진 않네요.","나쁘진 않은데 기대만큼은 아니에요.","보통이에요. 더 지켜봐야 할 것 같아요.",
  "수분감은 좀 느껴지는데 톤은 아직이에요.","무난해요. 부작용 없이 먹기 편해요.","절반쯤 먹었는데 판단하긴 일러요.",
  "좋다는 분 많아 기대했는데 저는 보통이에요.","피부가 예민해서 천천히 보는 중이에요.","기대가 컸나 봐요. 무난한 정도예요.","솔직히 아직 잘 모르겠어요.",
];
const NEG2 = [
  "저한테는 큰 효과가 없었어요. 향은 괜찮은데요.","두 달 먹었는데 체감이 약하네요.","기대가 컸나 봐요. 저랑은 안 맞았어요.",
  "맞는 분도 있겠지만 저는 별로였어요.","가격 대비 효과는 잘 모르겠어요.","꾸준히 먹었는데도 변화가 미미해요.","향은 좋은데 효과는 아쉬워요.",
];
const NEG1 = [
  "저는 효과를 전혀 못 느꼈어요.","제 피부엔 안 맞았어요. 아쉽네요.","기대했는데 변화가 없어 실망이에요.",
  "다 먹었는데 잘 모르겠어요.","저한텐 그냥 그랬어요. 재구매는 안 해요.","광고만큼은 아니었어요.",
];

// 친구한테 말하듯 반말·구어체 (완성 문장)
const CASUAL = [
  "와 이거 진짜 물건이야ㅋㅋ 3주쯤 되니까 결이 확실히 달라졌어.",
  "반신반의했는데 한 달 먹으니까 톤 올라온 게 눈에 보임. 강추ㅎㅎ",
  "친구가 피부 좋아졌다고 뭐 먹냐고 물어봄ㅋㅋ 이거라고 했지.",
  "솔직히 기대 안 했는데 웬걸… 화장이 안 떠. 신기함.",
  "파인애플맛이라 그냥 음료수처럼 먹게 돼ㅎㅎ 계속 먹는 중.",
  "이거 왜 이제 알았지… 속건조 잡혀서 너무 좋아.",
  "한 통 다 먹으니까 확실히 다름. 재구매 ㄱㄱ",
  "엄마랑 같이 먹는 중인데 둘 다 만족ㅎㅎ",
  "물 없이 톡 짜먹으니까 간편해서 안 빼먹게 돼.",
  "ㄹㅇ 8주쯤 되니까 탱탱함 살아남. 시술 안 받길 잘했어.",
  "그냥 믿고 먹는 중. 성분 다 까놔서 안심됨.",
  "피부 칙칙하다 소리 들었는데 요즘 화사해졌다 함ㅎㅎ",
  "아침에 부기 빠지는 게 체감됨. 이건 계속 먹을 듯.",
  "기대 안 했는데 잡티 옅어진 거 보고 깜짝. 진심 추천.",
  "비싼 앰플 살 바엔 이거… 가성비 인정.",
  "두 달째인데 결 진짜 매끈해졌어ㅎㅎ",
  "요즘 피부 좋아졌단 말 자주 들음. 기분 좋아ㅋㅋ",
  "처음엔 별 기대 없었는데 지금은 못 끊음.",
  "남편이 자기도 먹는다고 가져감ㅋㅋㅋ",
  "화장 안 해도 봐줄 만해져서 신기해.",
  "꾸준히 먹은 보람 있다… 거울 보는 게 좀 즐거워졌어.",
  "맛도 괜찮고 효과도 있고. 이 정도면 인정이지.",
  "피부과 다닐 돈으로 이거 먹는 게 낫더라ㅋㅋ",
  "환절기에 안 뒤집어진 게 신기함. 처음이야 이런 거.",
  "솔직히 광고 보고 의심했는데 미안… 잘 쓰고 있음.",
  "회사에서 피부 좋아졌다고 다들 물어봐ㅎㅎ 기분 좋다.",
  "한 포가 작아서 출근길에 그냥 쏙 먹어. 편함.",
  "탄력 떨어진 거 고민이었는데 요즘 좀 올라온 듯?",
  "이거 먹고 화장 노는 게 줄었어. 이것만으로도 만족.",
  "딸이랑 같이 먹는데 둘 다 결이 좋아졌어ㅎㅎ",
  "별거 기대 안 했는데 속부터 차오르는 느낌이 진짜 있더라.",
  "ㅋㅋ 솔직히 이거 없으면 허전함. 루틴 됐어.",
];
// 짧은 한줄평
const SHORT = [
  "인생템 등극ㅎㅎ","재구매각.","그냥 강추합니다.","진심 만족.","이거 물건이네요.","꾸준히 먹을 듯.","믿고 먹는 중.","기대 이상!","피부 톤 한 톤 밝아짐.","속건조 잡힘. 끝.","결이 달라졌어요, 진짜로.","추천추천!","맛도 좋고 효과도 좋고ㅎㅎ","이제 못 끊어요.","사길 잘했다.","강추ㅋㅋ","재구매 의사 백퍼.","피부가 좀 사네요.","계속 갈게요.","무조건 재구매.",
];
// 4점용 가벼운 캐주얼
const CASUAL4 = [
  "드라마틱하진 않은데 결은 좀 부드러워진 듯ㅎㅎ","큰 변화까진 아니어도 꾸준히 먹을 만해.","효과가 빠르진 않아도 톤은 좀 올라온 것 같음.","가격이 좀 있긴 한데 만족하는 편.","천천히 보는 중인데 나쁘진 않아.","아직 드라마틱하진 않지만 계속 먹어보려고ㅎㅎ",
];

function pos() {
  const sit = rnd(SIT), res = rnd(RES), cl = rnd(CLOSE);
  let res2 = rnd(RES); if (res2 === res) res2 = rnd(RES);
  const r = Math.random();
  if (r < 0.28) return `${sit}, ${chance(0.6) ? rnd(TL) + " " : ""}${res}. ${cl}`;
  if (r < 0.52) return `${rnd(TL)} ${res}. ${cl}`;
  if (r < 0.72) return `${sit}, ${res}.${res2 !== res ? ` ${res2}.` : ""} ${cl}`;
  if (r < 0.88) return `${res}. ${cl}`;
  return `${sit}, ${res}.`;
}
function pos4() {
  const res = rnd(RES), cl = rnd(CLOSE4);
  if (chance(0.5)) return `${rnd(CAVEAT)} ${res}. ${cl}`;
  return `${rnd(SIT)}, ${rnd(CAVEAT)} ${res}. ${cl}`;
}

function body(rating) {
  if (rating === 5) {
    const r = Math.random();
    if (r < 0.42) return pos();        // 존댓말 조합형
    if (r < 0.74) return rnd(CASUAL);  // 반말·구어체 완성문
    return rnd(SHORT);                 // 짧은 한줄평
  }
  if (rating === 4) return chance(0.45) ? rnd(CASUAL4) : pos4();
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
