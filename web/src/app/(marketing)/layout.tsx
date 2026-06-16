/**
 * Marketing pages (landing, product, science, about, legal) — a faithful
 * lift-and-shift of the original static ko/*.html. Nav + footer are rendered
 * ONCE here (shared chrome) and persist across client-side navigation; each
 * page only injects its content. Fonts are loaded by literal family name.
 *
 * Commerce routes (/checkout, /login, /account) live OUTSIDE this group.
 */
import "./_chrome.css";
import NavAuth from "./nav-auth";
import ChromeBehaviors from "./_chrome-client";
import ScrollTop from "./_scroll-top";
import { NAV_HTML, FOOTER_HTML } from "./_chrome";

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

      <div dangerouslySetInnerHTML={{ __html: NAV_HTML }} />
      {children}
      <div dangerouslySetInnerHTML={{ __html: FOOTER_HTML }} />

      <NavAuth />
      <ChromeBehaviors />
      <ScrollTop />
    </>
  );
}
