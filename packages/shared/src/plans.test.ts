import { describe, expect, it } from "vitest";
import { assistantAllowance, effectivePlan, PLANS } from "./plans";

const day = 86_400_000;
const now = new Date("2026-10-27T12:00:00Z");

describe("effectivePlan", () => {
  it("gives the trial plan during the trial and Free after it", () => {
    expect(effectivePlan({ plan: "growth", status: "trialing", trialEndsAt: new Date(now.getTime() + day) }, now).plan.id).toBe("growth");
    const ended = effectivePlan({ plan: "growth", status: "trialing", trialEndsAt: new Date(now.getTime() - day) }, now);
    expect(ended.plan.id).toBe("free");
    expect(ended.status).toBe("trial_ended");
  });

  it("keeps paid plans while past due and drops to Free when canceled", () => {
    expect(effectivePlan({ plan: "scale", status: "past_due", trialEndsAt: null }, now).plan.id).toBe("scale");
    expect(effectivePlan({ plan: "scale", status: "canceled", trialEndsAt: null }, now).plan.id).toBe("free");
    expect(effectivePlan(null, now).plan.id).toBe("free");
  });
});

describe("assistantAllowance", () => {
  it("allows chat up to 120% of the limit, actions up to 100%", () => {
    expect(assistantAllowance(PLANS.growth, { conversations: 2399, agentTasks: 499 })).toEqual({ canChat: true, canAct: true });
    expect(assistantAllowance(PLANS.growth, { conversations: 2400, agentTasks: 500 })).toEqual({ canChat: false, canAct: false });
  });

  it("never allows actions on Free", () => {
    expect(assistantAllowance(PLANS.free, { conversations: 0, agentTasks: 0 }).canAct).toBe(false);
  });
});
