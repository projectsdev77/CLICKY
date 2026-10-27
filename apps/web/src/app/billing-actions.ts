"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, subscription } from "@clicky/db";
import type { PlanId } from "@clicky/shared";
import { db } from "@/lib/db";
import { canManage, requireActiveOrg } from "@/lib/dal";
import { clearAllowanceCache } from "@/lib/billing";
import { createCheckoutUrl, createPortalUrl, stripeEnabled, type Interval } from "@/lib/stripe";

async function requireBillingAdmin() {
  const ctx = await requireActiveOrg();
  if (!canManage(ctx.role)) redirect("/billing");
  return ctx;
}

export async function startCheckout(plan: "growth" | "scale", interval: Interval) {
  const { organization, user } = await requireBillingAdmin();
  if (!stripeEnabled()) redirect("/billing?error=stripe");
  redirect(await createCheckoutUrl({ organizationId: organization.id, organizationName: organization.name, email: user.email, plan, interval }));
}

export async function openBillingPortal() {
  const { organization } = await requireBillingAdmin();
  const url = stripeEnabled() ? await createPortalUrl(organization.id) : null;
  redirect(url ?? "/billing");
}

/** Development only, while Stripe isn't set up: switch plans directly to try the limits. */
export async function devSwitchPlan(plan: PlanId) {
  if (process.env.NODE_ENV === "production" && process.env.CLICKY_DEV_BILLING !== "1") return;
  if (stripeEnabled()) return;
  const { organization } = await requireBillingAdmin();
  await db
    .update(subscription)
    .set(
      plan === "free"
        ? { plan: "free", status: "active", trialEndsAt: null }
        : { plan, status: "active", trialEndsAt: null },
    )
    .where(eq(subscription.organizationId, organization.id));
  clearAllowanceCache(organization.id);
  revalidatePath("/", "layout");
}
