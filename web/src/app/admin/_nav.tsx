"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  {
    href: "/admin",
    label: "주문관리",
    match: (p) => p === "/admin" || p.startsWith("/admin/orders"),
  },
  {
    href: "/admin/members",
    label: "회원관리",
    match: (p) => p.startsWith("/admin/members"),
  },
  {
    href: "/admin/reviews",
    label: "리뷰관리",
    match: (p) => p.startsWith("/admin/reviews"),
  },
  {
    href: "/admin/points",
    label: "포인트관리",
    match: (p) => p.startsWith("/admin/points"),
  },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-ink-line bg-bg-2">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6">
        <span className="py-4 font-sans text-lg font-light text-ink">
          glo <span className="text-sm text-ink-mute">admin</span>
        </span>
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
                {active && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 bg-accent" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
