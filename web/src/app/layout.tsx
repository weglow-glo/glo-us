import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

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
        <a href="#main" className="skip">
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
