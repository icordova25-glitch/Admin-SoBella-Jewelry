import Link from "next/link";

export default function AdminSidebar() {
  return (
    <aside className="panel">
      <h3>Admin</h3>
      <nav style={{ display: "grid", gap: "0.5rem" }}>
        <Link href="/admin">Dashboard</Link>
        <Link href="/admin/products">Products</Link>
        <Link href="/admin/products/new">Add Product</Link>
        <Link href="/admin/orders">Orders</Link>
      </nav>
    </aside>
  );
}
