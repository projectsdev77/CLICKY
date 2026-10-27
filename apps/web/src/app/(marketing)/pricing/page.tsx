import type { Metadata } from "next";
import { PLANS } from "@clicky/shared";
import { PricingCards } from "./pricing-cards";

export const metadata: Metadata = { title: "Pricing · Clicky" };

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-3 text-muted">Every plan starts with a 14-day free trial of Growth. No credit card needed.</p>
      <PricingCards plans={Object.values(PLANS).map((p) => ({ ...p, limits: { ...p.limits } }))} />
      <div className="mt-12 grid gap-8 text-sm md:grid-cols-2">
        <div>
          <h2 className="font-semibold">What counts as a conversation?</h2>
          <p className="mt-1 text-muted">One person&apos;s chat with Clicky, however many questions it includes.</p>
        </div>
        <div>
          <h2 className="font-semibold">What happens at the limit?</h2>
          <p className="mt-1 text-muted">
            Clicky keeps answering up to 20% past your conversation limit, then pauses until next month. If tasks run out,
            Clicky keeps guiding but stops clicking for users.
          </p>
        </div>
        <div>
          <h2 className="font-semibold">Can I cancel anytime?</h2>
          <p className="mt-1 text-muted">Yes. Plans are month to month; you keep access until the end of the period.</p>
        </div>
        <div>
          <h2 className="font-semibold">Do you offer discounts?</h2>
          <p className="mt-1 text-muted">Yearly plans save 20%. Startups and non-profits: ask us.</p>
        </div>
      </div>
    </div>
  );
}
