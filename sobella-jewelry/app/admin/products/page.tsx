import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type ProductRow = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  is_active: boolean;
  image_urls: string[] | null;
};

export default async function AdminProductsPage() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, price, stock_quantity, is_active, image_urls")
    .order("created_at", { ascending: false });

  const products: ProductRow[] = data || [];

  return (
    <section>
      <h1>Manage Products</h1>
      <div className="grid">
        {products.map((product) => (
          <article key={product.id} className="panel">
            {product.image_urls?.[0] ? <img src={product.image_urls[0]} alt={product.name} className="admin-product-thumb" /> : null}
            <h3>{product.name}</h3>
            <p>Price: ${Number(product.price).toFixed(2)}</p>
            <p>Stock: {product.stock_quantity}</p>
            <p>Status: {product.is_active ? "Active" : "Hidden"}</p>
            <Link href={`/admin/products/${product.id}/edit`}>Edit product</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
