// Server-side sign out: clears the (possibly httpOnly) auth cookies and
// redirects home. A plain form needs no client JS.
export function SignOutButton() {
  return (
    <form method="post" action="/auth/signout">
      <button
        type="submit"
        className="rounded-full border border-ink-line px-5 py-2.5 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
      >
        로그아웃
      </button>
    </form>
  );
}
