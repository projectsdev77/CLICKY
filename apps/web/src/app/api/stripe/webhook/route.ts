import { handleStripeWebhook } from "@/lib/stripe";

export async function POST(request: Request) {
  const ok = await handleStripeWebhook(await request.text(), request.headers.get("stripe-signature"));
  return new Response(null, { status: ok ? 200 : 400 });
}
