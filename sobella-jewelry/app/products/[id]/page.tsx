import { notFound } from "next/navigation";
import { createSupabasePublicServerClient } from "@/lib/supabase/server";

type ProductDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  stock_quantity: number;
  image_urls: string[] | null;
  image_descriptions: string[] | null;
};

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { id } = await params;
  const supabase = createSupabasePublicServerClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, description, price, category, stock_quantity, image_urls, image_descriptions")
    .eq("id", id)
    .eq("is_active", true)
    .single();

  const product = data as ProductRow | null;
  if (!product) {
    notFound();
  }

  const productImages = (product.image_urls || []).map((url, index) => ({
    url,
    description: product.image_descriptions?.[index] || "",
  }));

  return (
    <section className="panel">
      <h1>{product.name}</h1>
      <div className="image-gallery-grid">
        {productImages.map((image) => (
          <article key={image.url} className="image-gallery-card">
            <img className="product-image-soft" src={image.url} alt={image.description || product.name} />
            <p>{image.description || "No image description yet."}</p>
          </article>
        ))}
      </div>
      <p>{product.description}</p>
      <p>Category: {product.category || "Uncategorized"}</p>
      <p>In stock: {product.stock_quantity}</p>
      <p>Price: ${Number(product.price).toFixed(2)}</p>
    </section>
  );
}
