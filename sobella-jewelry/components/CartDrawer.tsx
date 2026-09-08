"use client";

import { useCartStore } from "@/store/cartStore";

export default function CartDrawer() {
  const items = useCartStore((state) => state.items);

  return (
    <aside className="panel">
      <h3>Cart</h3>
      <p>{items.length} item(s)</p>
    </aside>
  );
}
