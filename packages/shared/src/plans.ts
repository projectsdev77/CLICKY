/**
 * Plans and their limits. One source of truth for enforcement, the billing page
 * and the public pricing page. Prices are the proposal in docs/SPEC.md §8 and
 * still need the client's sign-off.
 */

export type PlanId = "free" | "growth" | "scale" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in USD; null = custom. */
  monthlyPrice: number | null;
  /** Yearly price per month in USD (20% off). */
  yearlyPricePerMonth: number | null;
  tagline: string;
  limits: {
    /** Conversations per billing month. */
    conversations: number;
    /** Completed agent tasks per billing month. */
    agentTasks: number;
    projects: number;
    /** Longest analytics range, in days. */
    analyticsDays: number;
  };
  features: string[];
}

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyPricePerMonth: 0,
    tagline: "Try Clicky on a side project.",
    limits: { conversations: 100, agentTasks: 0, projects: 1, analyticsDays: 7 },
    features: ["100 conversations a month", "Voice and on-screen pointing", "Guide-only mode", "7 days of analytics"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPrice: 199,
    yearlyPricePerMonth: 159,
    tagline: "For product teams reducing support load.",
    limits: { conversations: 2000, agentTasks: 500, projects: 3, analyticsDays: 90 },
    features: [
      "2,000 conversations a month",
      "500 tasks done for users",
      "3 projects",
      "Topics, knowledge gaps and friction map",
      "90 days of analytics",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPrice: 799,
    yearlyPricePerMonth: 639,
    tagline: "For high-traffic apps.",
    limits: { conversations: 10000, agentTasks: 3000, projects: UNLIMITED, analyticsDays: 90 },
    features: ["10,000 conversations a month", "3,000 tasks done for users", "Unlimited projects", "Everything in Growth"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    yearlyPricePerMonth: null,
    tagline: "Custom limits, SSO and a DPA.",
    limits: { conversations: UNLIMITED, agentTasks: UNLIMITED, projects: UNLIMITED, analyticsDays: 90 },
    features: ["Custom limits", "SAML SSO", "Data processing agreement", "Dedicated support"],
  },
};

export const TRIAL_DAYS = 14;
/** The plan a trial unlocks. */
export const TRIAL_PLAN: PlanId = "growth";
/** Conversations keep working up to this multiple of the limit before Clicky pauses (soft cap). */
export const CONVERSATION_GRACE = 1.2;

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

export interface PlanState {
  /** The plan whose limits apply right now. */
  plan: Plan;
  status: SubscriptionStatus | "trial_ended";
  trialEndsAt: Date | null;
}

/** Works out which plan's limits apply, given the stored subscription (if any). */
export function effectivePlan(sub: { plan: PlanId; status: SubscriptionStatus; trialEndsAt: Date | null } | null, now = new Date()): PlanState {
  if (!sub) return { plan: PLANS.free, status: "trial_ended", trialEndsAt: null };
  if (sub.status === "trialing") {
    if (sub.trialEndsAt && sub.trialEndsAt > now) return { plan: PLANS[sub.plan], status: "trialing", trialEndsAt: sub.trialEndsAt };
    return { plan: PLANS.free, status: "trial_ended", trialEndsAt: sub.trialEndsAt };
  }
  if (sub.status === "canceled") return { plan: PLANS.free, status: "canceled", trialEndsAt: null };
  // past_due keeps the paid plan while Stripe retries the payment.
  return { plan: PLANS[sub.plan], status: sub.status, trialEndsAt: null };
}

/** What the assistant may do this month, given usage so far. */
export function assistantAllowance(plan: Plan, usage: { conversations: number; agentTasks: number }) {
  return {
    canChat: usage.conversations < plan.limits.conversations * CONVERSATION_GRACE,
    canAct: plan.limits.agentTasks > 0 && usage.agentTasks < plan.limits.agentTasks,
  };
}
