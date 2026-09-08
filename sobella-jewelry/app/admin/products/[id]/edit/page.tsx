type AdminEditProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import ImageUploader from "@/components/ImageUploader";
import ProductImageGallery from "@/components/ProductImageGallery";

export default async function AdminEditProductPage({ params }: AdminEditProductPageProps) {
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name, category, description, image_urls, image_descriptions")
    .eq("id", id)
    .single();

  const productImages = (product?.image_urls || []).map((url, index) => ({
    url,
    description: product?.image_descriptions?.[index] || "",
  }));

  return (
    <section className="panel">
      <h1>Edit Product</h1>
      <p>Editing product ID: {id}</p>
      {product ? (
        <div className="admin-product-summary">
          <p><strong>{product.name}</strong></p>
          <p>Category: {product.category || "Uncategorized"}</p>
          <p>{product.description || "No description yet."}</p>
        </div>
      ) : null}
      <ProductImageGallery productId={id} title="Mirror customer view and edit image descriptions" editable images={productImages} />
      <ImageUploader productId={id} initialImageUrls={product?.image_urls || []} title="Product images and preview" />
    </section>
  );
}
