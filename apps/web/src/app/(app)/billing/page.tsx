import { PLANS, type PlanId } from "@clicky/shared";
import { canManage, requireActiveOrg } from "@/lib/dal";
import { getBillingState } from "@/lib/billing";
import { stripeEnabled } from "@/lib/stripe";
import { devSwitchPlan, openBillingPortal, startCheckout } from "@/app/billing-actions";
import { Button, Card } from "@/components/ui";

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = !Number.isFinite(limit);
  const ratio = unlimited || limit === 0 ? (used > 0 && limit === 0 ? 1 : 0) : used / limit;
  const fill = ratio >= 1 ? "bg-red-600" : ratio >= 0.8 ? "bg-amber-500" : "bg-chart-1";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">
          {used.toLocaleString()} / {unlimited ? "unlimited" : limit === 0 ? "not included" : limit.toLocaleString()}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 rounded-full bg-grid"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={unlimited ? used : limit}
        aria-valuenow={used}
      >
        <div className={`h-2 rounded-full ${fill}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment failed: please update your card",
  canceled: "Canceled",
  trial_ended: "Trial ended",
};

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const { organization, role } = await requireActiveOrg();
  const query = await searchParams;
  const state = await getBillingState(organization.id);
  const manage = canManage(role);
  const stripe = stripeEnabled();
  const devBilling = !stripe && (process.env.NODE_ENV !== "production" || process.env.CLICKY_DEV_BILLING === "1");
  const sub = state.subscription;

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Billing</h1>
      {query.upgraded && <p className="rounded-md bg-green-600/10 p-3 text-sm text-green-700 dark:text-green-400">Thanks! Your plan is updated.</p>}
      {query.error === "stripe" && <p className="rounded-md bg-amber-500/10 p-3 text-sm">Payments aren&apos;t set up yet.</p>}

      <Card
        title={`${state.plan.name} plan`}
        description={
          <>
            {STATUS_TEXT[state.status] ?? state.status}
            {state.status === "trialing" && state.trialEndsAt && <> · ends {state.trialEndsAt.toLocaleDateString()}</>}
            {sub.cancelAtPeriodEnd && sub.periodEnd && <> · cancels on {sub.periodEnd.toLocaleDateString()}</>}
            {" · "}usage resets {state.period.end.toLocaleDateString()}
          </>
        }
      >
        <div className="space-y-4">
          <Meter label="Conversations this month" used={state.usage.conversations} limit={state.plan.limits.conversations} />
          <Meter label="Tasks done for users" used={state.usage.agentTasks} limit={state.plan.limits.agentTasks} />
          <Meter label="Projects" used={state.usage.projects} limit={state.plan.limits.projects} />
          <p className="text-xs text-muted">
            When conversations pass the limit, Clicky keeps answering up to 20% more, then pauses until the next month. When
            tasks run out, Clicky keeps guiding but stops clicking for users.
          </p>
          {manage && stripe && sub.stripeCustomerId && (
            <form action={openBillingPortal}>
              <Button variant="secondary">Manage billing, card and invoices</Button>
            </form>
          )}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["growth", "scale"] as const).map((id) => {
          const plan = PLANS[id];
          const current = state.plan.id === id && state.status === "active";
          return (
            <Card key={id} title={plan.name} description={plan.tagline}>
              <p className="text-3xl font-semibold">
                ${plan.monthlyPrice}
                <span className="text-sm font-normal text-muted">/month</span>
              </p>
              <p className="text-xs text-muted">or ${plan.yearlyPricePerMonth}/month billed yearly</p>
              <ul className="mt-4 space-y-1 text-sm">
                {plan.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {manage && !current && stripe && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={startCheckout.bind(null, id, "month")}>
                    <Button>Upgrade monthly</Button>
                  </form>
                  <form action={startCheckout.bind(null, id, "year")}>
                    <Button variant="secondary">Yearly (save 20%)</Button>
                  </form>
                </div>
              )}
              {current && <p className="mt-4 text-sm font-medium text-brand-ink">Your current plan</p>}
            </Card>
          );
        })}
      </div>
      <p className="text-sm text-muted">
        Need more, SSO or a DPA? <a className="text-brand-ink" href="mailto:sales@clicky.local">Talk to us about Enterprise</a>.
      </p>

      {manage && devBilling && (
        <Card title="Development: switch plan" description="Stripe isn't configured, so you can switch plans directly to try the limits. Hidden in production.">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLANS) as PlanId[]).map((id) => (
              <form key={id} action={devSwitchPlan.bind(null, id)}>
                <Button variant="secondary">{PLANS[id].name}</Button>
              </form>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
