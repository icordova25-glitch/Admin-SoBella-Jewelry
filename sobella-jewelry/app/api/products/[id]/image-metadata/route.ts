import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ImagePayload = {
  url: string;
  description: string;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { images?: ImagePayload[] };

    if (!Array.isArray(body.images)) {
      return NextResponse.json({ error: "images are required" }, { status: 400 });
    }

    const imageUrls = body.images.map((image) => image.url);
    const imageDescriptions = body.images.map((image) => image.description || "");

    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("products")
      .update({ image_urls: imageUrls, image_descriptions: imageDescriptions })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ image_urls: imageUrls, image_descriptions: imageDescriptions });
  } catch (error) {
    return NextResponse.json({ error: "Unable to update image metadata" }, { status: 500 });
  }
}
