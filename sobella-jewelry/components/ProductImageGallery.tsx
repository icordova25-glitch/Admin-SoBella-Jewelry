"use client";

import { useEffect, useState } from "react";

type GalleryImage = {
  url: string;
  description: string;
};

type ProductImageGalleryProps = {
  productId: string;
  title?: string;
  editable?: boolean;
  images: GalleryImage[];
};

export default function ProductImageGallery({ productId, title = "Image gallery", editable = false, images }: ProductImageGalleryProps) {
  const [galleryImages, setGalleryImages] = useState(images);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setGalleryImages(images);
  }, [images]);

  function updateDescription(index: number, description: string) {
    setGalleryImages((currentImages) =>
      currentImages.map((image, currentIndex) => (currentIndex === index ? { ...image, description } : image)),
    );
  }

  async function saveDescriptions() {
    const response = await fetch(`/api/products/${productId}/image-metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: galleryImages }),
    });

    if (!response.ok) {
      setStatus("Unable to save image descriptions.");
      return;
    }

    setStatus("Saved image descriptions.");
  }

  return (
    <section className="image-gallery panel">
      <div className="image-gallery-head">
        <div>
          <h2>{title}</h2>
          <p>{editable ? "Edit the descriptions shown on the customer page." : "Customer view preview."}</p>
        </div>
        {editable ? <button className="cta" type="button" onClick={saveDescriptions}>Save descriptions</button> : null}
      </div>

      <div className="image-gallery-grid">
        {galleryImages.map((image, index) => (
          <article key={image.url} className="image-gallery-card">
            <img src={image.url} alt={image.description || "Product image"} />
            {editable ? (
              <label className="image-gallery-field">
                <span>Description</span>
                <textarea value={image.description} onChange={(event) => updateDescription(index, event.target.value)} placeholder="Describe this image for the customer view" />
              </label>
            ) : (
              <p>{image.description || "No image description yet."}</p>
            )}
          </article>
        ))}
      </div>

      {status ? <p>{status}</p> : null}
    </section>
  );
}
