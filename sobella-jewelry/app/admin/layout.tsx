import type { ReactNode } from "react";
import AdminSidebar from "@/components/AdminSidebar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "1rem" }}>
      <AdminSidebar />
      <section>{children}</section>
    </div>
  );
}
