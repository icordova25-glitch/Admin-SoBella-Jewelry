import { NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CheckoutItemInput = {
  productId: string;
  quantity: number;
};

type CheckoutRequestBody = {
  customerEmail: string;
  customerName?: string;
  shippingAddress?: Record<string, unknown>;
  items: CheckoutItemInput[];
};

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  image_urls: string[] | null;
};

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const body = (await request.json()) as CheckoutRequestBody;
    const customerEmail = String(body.customerEmail || "").trim().toLowerCase();
    const customerName = String(body.customerName || "").trim() || null;
    const items = Array.isArray(body.items) ? body.items : [];
    const shippingAddress = body.shippingAddress || null;

    if (!customerEmail || items.length === 0) {
      return NextResponse.json({ error: "customerEmail and items are required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];
    const { data: productRows, error: productError } = await supabase
      .from("products")
      .select("id, name, description, price, stock_quantity, image_urls")
      .in("id", uniqueProductIds)
      .eq("is_active", true);

    if (productError) {
      return NextResponse.json({ error: productError.message }, { status: 400 });
    }

    const products = (productRows || []) as ProductRow[];
    const productMap = new Map(products.map((product) => [product.id, product]));

    const stripeLineItems: Array<{
      price_data: {
        currency: "usd";
        product_data: { name: string; description?: string; images?: string[] };
        unit_amount: number;
      };
      quantity: number;
    }> = [];

    const orderItemsPayload: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
    }> = [];

    let totalAmount = 0;

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!item.productId || !Number.isInteger(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "Each item requires productId and positive integer quantity" }, { status: 400 });
      }

      const product = productMap.get(item.productId);
      if (!product) {
        return NextResponse.json({ error: `Product ${item.productId} was not found` }, { status: 404 });
      }

      if (product.stock_quantity < quantity) {
        return NextResponse.json({ error: `Not enough stock for ${product.name}` }, { status: 400 });
      }

      const unitAmountCents = Math.round(Number(product.price) * 100);
      totalAmount += Number(product.price) * quantity;
      stripeLineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            description: product.description || undefined,
            images: product.image_urls?.length ? [product.image_urls[0]] : undefined,
          },
          unit_amount: unitAmountCents,
        },
        quantity,
      });

      orderItemsPayload.push({
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: Number(product.price),
      });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_email: customerEmail,
        customer_name: customerName,
        shipping_address: shippingAddress,
        total_amount: Number(totalAmount.toFixed(2)),
        status: "pending",
      })
      .select("id")
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || "Unable to create order" }, { status: 400 });
    }

    const { error: orderItemsError } = await supabase
      .from("order_items")
      .insert(orderItemsPayload.map((item) => ({ ...item, order_id: order.id })));

    if (orderItemsError) {
      return NextResponse.json({ error: orderItemsError.message }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: stripeLineItems,
      customer_email: customerEmail,
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/cart`,
      metadata: {
        order_id: order.id,
      },
    });

    await supabase
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return NextResponse.json({ checkoutUrl: session.url, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
