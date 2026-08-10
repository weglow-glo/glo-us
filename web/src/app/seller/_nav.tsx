"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: "/seller", label: "대시보드", match: (p) => p === "/seller" },
  { href: "/seller/apply", label: "일정 신청", match: (p) => p.startsWith("/seller/apply") },
  { href: "/seller/settlements", label: "정산", match: (p) => p.startsWith("/seller/settlements") },
];

export default function SellerNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-ink-line bg-bg-2">
      <div className="mx-auto flex max-w-4xl items-center gap-6 px-6">
        <Link href="/" className="py-4 text-lg font-light text-ink">
          <span className="font-display">glo</span>{" "}
          <span className="font-sans text-sm text-ink-mute">셀러 센터</span>
        </Link>
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative px-4 py-4 text-sm font-semibold transition ${
                  active ? "text-ink" : "text-ink-mute hover:text-ink"
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
