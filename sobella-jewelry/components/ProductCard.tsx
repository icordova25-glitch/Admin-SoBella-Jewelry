type Product = {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  imageAlt?: string;
};

export default function ProductCard({ product }: { product: Product }) {
  return (
    <article className="panel">
      {product.imageUrl ? <img className="product-image-soft" src={product.imageUrl} alt={product.imageAlt || product.name} /> : null}
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <strong>${product.price}</strong>
    </article>
  );
}
