import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";

export const metadata: Metadata = {
  title: "SOBELLA JEWELRY CO.",
  description: "SOBELLA JEWELRY CO. storefront and admin",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <nav>
            <Link href="/">Home</Link>
            <Link href="/products">Products</Link>
            <Link href="/cart">Cart</Link>
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <main className="page-wrap">{children}</main>
      </body>
    </html>
  );
}
