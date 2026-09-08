import ProductCard from "@/components/ProductCard";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_urls: string[] | null;
  image_descriptions: string[] | null;
};

export default async function HomePage() {
  const supabase = createSupabasePublicServerClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, description, price, image_urls, image_descriptions")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  const featured: ProductRow[] = data || [];

  return (
    <section>
      <h1>SOBELLA JEWELRY CO.</h1>
      <p>Featured pieces from the latest collection.</p>
      <div className="grid">
        {featured.map((product) => (
          <ProductCard
            key={product.id}
            product={{
              id: product.id,
              name: product.name,
              description: product.description || undefined,
              price: Number(product.price),
              imageUrl: product.image_urls?.[0],
              imageAlt: product.image_descriptions?.[0] || product.name,
            }}
          />
        ))}
      </div>
    </section>
  );
}
