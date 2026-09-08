"use client";

import { useCartStore } from "@/store/cartStore";

export default function CartPage() {
  const items = useCartStore((state) => state.items);

  return (
    <section>
      <h1>Your Cart</h1>
      {items.length === 0 ? <p>Your cart is empty.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.productId}>
            {item.name} x {item.quantity}
          </li>
        ))}
      </ul>
    </section>
  );
}
