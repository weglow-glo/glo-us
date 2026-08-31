import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import ChannelTalk from "./channel-talk";
import CsWidget from "./cs-widget";
import MetaPixel from "./meta-pixel";
import NaverCts from "./naver-cts";
import GoogleAnalytics from "./google-analytics";

// Display serif — headlines, italic accent emphasis, ingredient names, large numerals
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
});

// Body sans — copy, buttons, nav, labels
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.glo-us.com"),
  title: "glo — A quieter kind of glow.",
  description: "스킨 롱제비티 프로토콜. 9가지 임상 검증 성분, 4×9 프로토콜. 하루 한 잔.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#3a1a22",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg-1 text-ink font-sans">
        {/* Wanted Sans — app-wide base font (commerce + marketing). Marketing pages
            also set it via their inline CSS; this covers checkout/account/login/admin. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/complete/WantedSansVariable.min.css"
        />
        <a href="#main" className="skip">
          본문으로 건너뛰기
        </a>
        {children}
        {/* 자체 CS 채팅 전환 플래그 — 1이면 자체 위젯, 아니면 채널톡 (병행 검증 후 제거 예정) */}
        {process.env.NEXT_PUBLIC_CS_WIDGET === "1" ? <CsWidget /> : <ChannelTalk />}
        <MetaPixel />
        <NaverCts />
        <GoogleAnalytics />
      </body>
    </html>
  );
}
