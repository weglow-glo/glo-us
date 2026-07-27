/**
 * 알림톡 발송 환경변수 진단 페이지 (관리자 전용, /admin 하위라 Basic Auth 보호).
 *
 * 알림톡이 안 나가고 문자(LMS)로만 나갈 때, 실제 배포된 프로덕션 런타임에서
 * 환경변수가 잡히는지 눈으로 확인하기 위한 페이지. 값은 절대 노출하지 않고
 * 존재 여부와 길이만 보여준다. (SOLAPI_PFID + TEMPLATE_SHIPPED 둘 다 있어야
 * 배송 알림톡이 나간다 — 하나라도 비면 문자로 폴백된다.)
 */
export const dynamic = "force-dynamic";

function Row({ name, required }: { name: string; required?: boolean }) {
  const raw = process.env[name];
  const present = typeof raw === "string" && raw.trim().length > 0;
  // 값 자체는 노출하지 않는다 — 존재 여부·길이·앞뒤 공백 여부만.
  const len = raw ? raw.length : 0;
  const trimmedLen = raw ? raw.trim().length : 0;
  const hasSpace = present && len !== trimmedLen;
  return (
    <tr className="border-b border-ink-line">
      <td className="py-3 pr-4 font-mono text-sm text-ink">{name}</td>
      <td className="py-3 pr-4">
        {present ? (
          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
            있음
          </span>
        ) : (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
            {required ? "없음 ← 문제!" : "없음"}
          </span>
        )}
      </td>
      <td className="py-3 pr-4 text-sm text-ink-mute">{present ? `${trimmedLen}자` : "—"}</td>
      <td className="py-3 text-sm">
        {hasSpace ? (
          <span className="font-semibold text-red-700">앞뒤 공백 있음 ← 확인</span>
        ) : (
          <span className="text-ink-faint">정상</span>
        )}
      </td>
    </tr>
  );
}

export default function NotifyConfigPage() {
  const pfId = (process.env.SOLAPI_PFID ?? "").trim();
  const shipped = (process.env.SOLAPI_TEMPLATE_SHIPPED ?? "").trim();
  const review = (process.env.SOLAPI_TEMPLATE_REVIEW ?? "").trim();
  const points = (process.env.SOLAPI_TEMPLATE_POINTS ?? "").trim();

  const shippedAlim = Boolean(pfId && shipped);
  const reviewAlim = Boolean(pfId && review);
  const pointsAlim = Boolean(pfId && points);

  const Verdict = ({ on, label }: { on: boolean; label: string }) => (
    <li className="flex items-center gap-2">
      <span className={on ? "text-green-700" : "text-red-700"}>{on ? "✓" : "✗"}</span>
      <span className="text-ink-soft">
        {label} — <b className={on ? "text-green-700" : "text-red-700"}>{on ? "알림톡 발송" : "문자(LMS)로 폴백"}</b>
      </span>
    </li>
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-light text-ink">
        <span className="font-display">glo</span> 알림톡 설정 진단
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        지금 보고 있는 이 페이지는 <b>실제 배포된 프로덕션 서버</b>에서 읽은 값입니다. 아래에서
        <code className="mx-1 rounded bg-bg-3 px-1.5 py-0.5 text-xs">SOLAPI_PFID</code>와 각 템플릿 ID가
        “있음”으로 나와야 알림톡이 나갑니다. 하나라도 “없음”이면 그 알림은 문자로 나갑니다.
      </p>

      <div className="mt-8 rounded-2xl border border-ink-line bg-bg-2 p-6">
        <h2 className="text-sm font-semibold text-ink">현재 발송 채널</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <Verdict on={shippedAlim} label="배송 시작 안내" />
          <Verdict on={reviewAlim} label="리뷰 작성 요청" />
          <Verdict on={pointsAlim} label="포인트 소멸 안내" />
        </ul>
      </div>

      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-ink-line text-left">
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-ink-mute">
              환경변수
            </th>
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-ink-mute">
              상태
            </th>
            <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wide text-ink-mute">
              길이
            </th>
            <th className="py-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">
              공백
            </th>
          </tr>
        </thead>
        <tbody>
          <Row name="SOLAPI_API_KEY" required />
          <Row name="SOLAPI_API_SECRET" required />
          <Row name="SOLAPI_SENDER" required />
          <Row name="SOLAPI_PFID" required />
          <Row name="SOLAPI_TEMPLATE_SHIPPED" required />
          <Row name="SOLAPI_TEMPLATE_REVIEW" />
          <Row name="SOLAPI_TEMPLATE_POINTS" />
        </tbody>
      </table>

      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        “없음”이 뜨면 Vercel → Settings → Environment Variables 에서 해당 변수를 <b>Production</b>{" "}
        스코프로 추가/수정한 뒤, 반드시 <b>새로 배포(Redeploy)</b>해야 반영됩니다. (빌드 캐시를 쓰지
        않는 재배포여야 합니다.) 값에 따옴표나 앞뒤 공백이 섞이지 않았는지도 확인하세요.
      </p>
    </main>
  );
}
