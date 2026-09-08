import ImageUploader from "@/components/ImageUploader";

export default function AdminNewProductPage() {
  return (
    <section className="panel">
      <h1>Add Product</h1>
      <ImageUploader title="Upload and preview product images" />
    </section>
  );
}
