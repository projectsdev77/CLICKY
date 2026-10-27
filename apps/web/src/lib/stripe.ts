import "server-only";
import Stripe from "stripe";
import { eq, subscription } from "@clicky/db";
import type { PlanId } from "@clicky/shared";
import { clearAllowanceCache, getSubscription } from "./billing";
import { db } from "./db";
import { env } from "./env";

let client: Stripe | null = null;

export function stripeEnabled() {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICES.growth.month && env.STRIPE_PRICES.scale.month);
}

function stripe() {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export type Interval = "month" | "year";

function priceFor(plan: "growth" | "scale", interval: Interval) {
  return env.STRIPE_PRICES[plan][interval] ?? env.STRIPE_PRICES[plan].month!;
}

function planForPrice(priceId: string | undefined): PlanId | null {
  for (const plan of ["growth", "scale"] as const) {
    if (Object.values(env.STRIPE_PRICES[plan]).includes(priceId)) return plan;
  }
  return null;
}

async function customerFor(organizationId: string, email: string, name: string) {
  const sub = await getSubscription(organizationId);
  if (sub.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await stripe().customers.create({ email, name, metadata: { organizationId } });
  await db.update(subscription).set({ stripeCustomerId: customer.id }).where(eq(subscription.organizationId, organizationId));
  return customer.id;
}

/** A Stripe Checkout page for upgrading to a paid plan. */
export async function createCheckoutUrl(opts: {
  organizationId: string;
  organizationName: string;
  email: string;
  plan: "growth" | "scale";
  interval: Interval;
}) {
  const customer = await customerFor(opts.organizationId, opts.email, opts.organizationName);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: opts.organizationId,
    line_items: [{ price: priceFor(opts.plan, opts.interval), quantity: 1 }],
    subscription_data: { metadata: { organizationId: opts.organizationId } },
    allow_promotion_codes: true,
    success_url: `${env.APP_URL}/billing?upgraded=1`,
    cancel_url: `${env.APP_URL}/billing`,
  });
  return session.url!;
}

/** Stripe's customer portal: change plan, update card, cancel, invoices. */
export async function createPortalUrl(organizationId: string) {
  const sub = await getSubscription(organizationId);
  if (!sub.stripeCustomerId) return null;
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${env.APP_URL}/billing`,
  });
  return session.url;
}

const STATUS: Partial<Record<Stripe.Subscription.Status, "active" | "past_due" | "canceled">> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  incomplete_expired: "canceled",
};

/** Mirrors a Stripe subscription onto the organization's plan. */
async function syncSubscription(sub: Stripe.Subscription) {
  const organizationId = sub.metadata.organizationId;
  const status = STATUS[sub.status];
  const item = sub.items.data[0];
  const plan = planForPrice(item?.price.id);
  if (!organizationId || !status || !plan) return; // e.g. "incomplete": wait for the next event
  await db
    .update(subscription)
    .set({
      plan,
      status,
      trialEndsAt: null,
      stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      periodStart: item ? new Date(item.current_period_start * 1000) : new Date(),
      periodEnd: item ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    })
    .where(eq(subscription.organizationId, organizationId));
  clearAllowanceCache(organizationId);
}

/** Verifies and applies a Stripe webhook. Returns false if the signature is invalid. */
export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  if (!env.STRIPE_WEBHOOK_SECRET || !signature) return false;
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return false;
  }
  switch (event.type) {
    case "checkout.session.completed": {
      const id = event.data.object.subscription;
      if (id) await syncSubscription(await stripe().subscriptions.retrieve(typeof id === "string" ? id : id.id));
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      break;
  }
  return true;
}
