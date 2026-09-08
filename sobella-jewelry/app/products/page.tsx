import Link from "next/link";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

type ProductRow = {
  id: string;
  name: string;
  price: number;
  image_urls: string[] | null;
  image_descriptions: string[] | null;
};

export default async function ProductsPage() {
  const supabase = createSupabasePublicServerClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, price, image_urls, image_descriptions")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const products: ProductRow[] = data || [];

  return (
    <section>
      <h1>Product Catalog</h1>
      <div className="grid">
        {products.map((product) => (
          <article key={product.id} className="panel">
            {product.image_urls?.[0] ? (
              <img className="product-image-soft" src={product.image_urls[0]} alt={product.image_descriptions?.[0] || product.name} />
            ) : null}
            <h2>{product.name}</h2>
            <p>${product.price}</p>
            <Link href={`/products/${product.id}`}>View details</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
