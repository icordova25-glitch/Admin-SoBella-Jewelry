import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const productId = String(formData.get("productId") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const filePath = `products/${Date.now()}-${file.name}`;

    const uploadResult = await supabase.storage
      .from("product-images")
      .upload(filePath, file, { upsert: true });

    if (uploadResult.error) {
      return NextResponse.json({ error: uploadResult.error.message }, { status: 400 });
    }

    const publicResult = supabase.storage.from("product-images").getPublicUrl(filePath);

    if (productId) {
      const { data: existingProduct, error: productError } = await supabase
        .from("products")
        .select("image_urls, image_descriptions")
        .eq("id", productId)
        .single();

      if (productError || !existingProduct) {
        return NextResponse.json({ error: productError?.message || "Product not found" }, { status: 404 });
      }

      const nextImageUrls = [...(existingProduct.image_urls || []), publicResult.data.publicUrl];
      const nextImageDescriptions = [...(existingProduct.image_descriptions || []), ""];
      const { error: updateError } = await supabase
        .from("products")
        .update({ image_urls: nextImageUrls, image_descriptions: nextImageDescriptions })
        .eq("id", productId);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ path: filePath, url: publicResult.data.publicUrl, image_urls: nextImageUrls, image_descriptions: nextImageDescriptions });
    }

    return NextResponse.json({ path: filePath, url: publicResult.data.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: "Unable to upload image" }, { status: 500 });
  }
}
