import AdminNav from "./_nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-1">
      <AdminNav />
      {children}
    </div>
  );
}
