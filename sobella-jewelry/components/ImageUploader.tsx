"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";

type ImageUploaderProps = {
  productId?: string;
  initialImageUrls?: string[];
  title?: string;
};

export default function ImageUploader({ productId, initialImageUrls = [], title = "Product images" }: ImageUploaderProps) {
  const [status, setStatus] = useState("");
  const [imageUrls, setImageUrls] = useState(initialImageUrls);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);

  useEffect(() => {
    setImageUrls(initialImageUrls);
  }, [initialImageUrls]);

  const imageCount = useMemo(() => imageUrls.length, [imageUrls]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const filePreviewUrl = URL.createObjectURL(file);
    setSelectedFilePreview(filePreviewUrl);

    const formData = new FormData();
    formData.append("file", file);
    if (productId) {
      formData.append("productId", productId);
    }

    const response = await fetch("/api/products/upload-image", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setStatus("Upload failed.");
      URL.revokeObjectURL(filePreviewUrl);
      return;
    }

    const data = await response.json();
    const nextImageUrls = Array.isArray(data.image_urls) ? data.image_urls : [...imageUrls, data.url];
    setImageUrls(nextImageUrls);
    setStatus(`Uploaded: ${data.url}`);
    setSelectedPreview(data.url);
    URL.revokeObjectURL(filePreviewUrl);
  }

  return (
    <div className="image-manager">
      <div className="image-manager-head">
        <div>
          <h2>{title}</h2>
          <p>{imageCount} image{imageCount === 1 ? "" : "s"} saved</p>
        </div>
        <input type="file" accept="image/*" onChange={handleUpload} />
      </div>

      {selectedFilePreview ? (
        <button type="button" className="image-preview-tile image-preview-selected" onClick={() => setSelectedPreview(selectedFilePreview)}>
          <img src={selectedFilePreview} alt="Selected file preview" />
          <span>Preview selected file</span>
        </button>
      ) : null}

      <div className="image-preview-grid">
        {imageUrls.map((url) => (
          <button key={url} type="button" className="image-preview-tile" onClick={() => setSelectedPreview(url)}>
            <img src={url} alt="Saved product preview" />
            <span>Preview</span>
          </button>
        ))}
      </div>

      <p>{status}</p>

      {selectedPreview ? (
        <button type="button" className="image-preview-overlay" onClick={() => setSelectedPreview(null)}>
          <div className="image-preview-card">
            <img src={selectedPreview} alt="Expanded product preview" />
            <span>Click anywhere to close</span>
          </div>
        </button>
      ) : null}
    </div>
  );
}
