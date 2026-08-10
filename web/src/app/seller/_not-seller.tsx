/** 로그인은 됐지만 셀러로 등록되지 않은 계정 안내 */
export default function NotSeller() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="font-sans text-2xl font-light text-ink">셀러 전용 공간입니다</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        지금 로그인한 계정은 셀러로 등록되어 있지 않습니다.
        <br />
        공동구매·협찬 진행을 원하시면{" "}
        <a href="mailto:official@weglow.biz" className="text-accent hover:underline">
          official@weglow.biz
        </a>
        로 연락해주세요.
      </p>
      <p className="mt-6 text-xs text-ink-mute">
        이미 셀러 계약이 완료됐다면, 등록에 사용한 카카오 계정으로 로그인했는지 확인해주세요.
      </p>
    </main>
  );
}
