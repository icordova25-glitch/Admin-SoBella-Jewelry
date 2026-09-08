import Stripe from "stripe";

export function getStripeClient() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is required");
  }

  return new Stripe(apiKey, {
    apiVersion: "2025-02-24.acacia",
  });
}
