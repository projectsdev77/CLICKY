"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@clicky/shared";

export function PricingCards({ plans }: { plans: Plan[] }) {
  const [yearly, setYearly] = useState(false);
  return (
    <>
      <div className="mt-8 inline-flex rounded-md border border-border p-1 text-sm" role="group" aria-label="Billing period">
        {[false, true].map((y) => (
          <button
            key={String(y)}
            type="button"
            aria-pressed={yearly === y}
            onClick={() => setYearly(y)}
            className={`rounded px-3 py-1.5 ${yearly === y ? "bg-card font-medium shadow-sm" : "text-muted"}`}
          >
            {y ? "Yearly (save 20%)" : "Monthly"}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const price = yearly ? plan.yearlyPricePerMonth : plan.monthlyPrice;
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-lg border bg-card p-5 ${plan.id === "growth" ? "border-brand" : "border-border"}`}
            >
              <h2 className="font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
              <p className="mt-4 text-3xl font-semibold">
                {price === null ? "Custom" : `$${price}`}
                {price ? <span className="text-sm font-normal text-muted">/month</span> : null}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Link
                href={plan.id === "enterprise" ? "mailto:sales@clicky.local" : "/sign-up"}
                className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium ${plan.id === "growth" ? "bg-brand text-white" : "border border-border"}`}
              >
                {plan.id === "enterprise" ? "Contact us" : plan.id === "free" ? "Start free" : "Start free trial"}
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
