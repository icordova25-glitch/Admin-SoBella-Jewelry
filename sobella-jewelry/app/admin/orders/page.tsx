import { createSupabaseAdminClient } from "@/lib/supabase/server";

type OrderRow = {
  id: string;
  customer_email: string;
  customer_name: string | null;
  total_amount: number;
  status: string;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
  }>;
};

export default async function AdminOrdersPage() {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("orders")
    .select("id, customer_email, customer_name, total_amount, status, created_at, order_items(id, product_name, quantity, unit_price)")
    .order("created_at", { ascending: false })
    .limit(100);

  const orders: OrderRow[] = data || [];

  return (
    <section>
      <h1>Manage Orders</h1>
      {orders.length === 0 ? <p>No orders yet.</p> : null}
      <div className="grid">
        {orders.map((order) => (
          <article key={order.id} className="panel">
            <h3>{order.customer_name || "Customer"}</h3>
            <p>{order.customer_email}</p>
            <p>Status: {order.status}</p>
            <p>Total: ${Number(order.total_amount).toFixed(2)}</p>
            <ul>
              {order.order_items.map((item) => (
                <li key={item.id}>
                  {item.product_name} x {item.quantity} @ ${Number(item.unit_price).toFixed(2)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
