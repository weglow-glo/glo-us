/**
 * Marketing pages (landing, product, science, about, legal) are a faithful
 * lift-and-shift of the original static ko/*.html. Each page carries its own
 * co-located CSS (generated from the source <style> block) and the markup is
 * injected verbatim via dangerouslySetInnerHTML. This layout only loads the
 * web fonts the marketing CSS expects by literal family name.
 *
 * Commerce routes (/checkout, /login, /account) live OUTSIDE this group and
 * use Tailwind — the two styling worlds stay separate.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,300;1,9..144,400&family=Inter:wght@300;400;500;600;700&family=Noto+Serif+KR:wght@300;400;500;600&display=swap"
      />
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
      />
      {children}
    </>
  );
}
