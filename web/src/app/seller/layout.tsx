import type { Metadata } from "next";
import SellerNav from "./_nav";

export const metadata: Metadata = {
  title: "셀러 센터 — glo",
  robots: { index: false, follow: false },
};

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-1">
      <SellerNav />
      {children}
    </div>
  );
}
