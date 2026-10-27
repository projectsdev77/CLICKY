import "server-only";
import {
  agentAction,
  agentRun,
  and,
  conversation,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  ne,
  organization,
  project,
  subscription,
} from "@clicky/db";
import { assistantAllowance, effectivePlan, TRIAL_DAYS, TRIAL_PLAN, type PlanState } from "@clicky/shared";
import { db } from "./db";

type Subscription = typeof subscription.$inferSelect;

/** Starts the free trial for a new organization. */
export async function startTrial(organizationId: string, from = new Date()) {
  await db
    .insert(subscription)
    .values({
      organizationId,
      plan: TRIAL_PLAN,
      status: "trialing",
      trialEndsAt: new Date(from.getTime() + TRIAL_DAYS * 86_400_000),
      periodStart: from,
    })
    .onConflictDoNothing();
}

/** The organization's subscription, creating the trial row for organizations made before billing existed. */
export async function getSubscription(organizationId: string): Promise<Subscription> {
  const [row] = await db.select().from(subscription).where(eq(subscription.organizationId, organizationId));
  if (row) return row;
  const [org] = await db.select({ createdAt: organization.createdAt }).from(organization).where(eq(organization.id, organizationId));
  await startTrial(organizationId, org?.createdAt ?? new Date());
  const [created] = await db.select().from(subscription).where(eq(subscription.organizationId, organizationId));
  return created!;
}

/** The current billing month: Stripe's period when we have one, otherwise monthly from periodStart. */
export function currentPeriod(sub: Pick<Subscription, "periodStart" | "periodEnd">, now = new Date()): { start: Date; end: Date } {
  if (sub.periodEnd && sub.periodEnd > now && sub.periodStart <= now) return { start: sub.periodStart, end: sub.periodEnd };
  const start = new Date(sub.periodStart);
  while (addMonth(start) <= now) start.setTime(addMonth(start).getTime());
  return { start, end: addMonth(start) };
}

function addMonth(d: Date) {
  const next = new Date(d);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Just the plan (no usage counting), for gating features like the analytics range. */
export async function getPlanState(organizationId: string): Promise<PlanState> {
  return effectivePlan(await getSubscription(organizationId));
}

export interface Usage {
  conversations: number;
  agentTasks: number;
  projects: number;
}

export async function getUsage(organizationId: string, since: Date): Promise<Usage> {
  const projectIds = db.select({ id: project.id }).from(project).where(eq(project.organizationId, organizationId));
  const [[c], [t], [p]] = await Promise.all([
    db
      .select({ n: count() })
      .from(conversation)
      .where(and(inArray(conversation.projectId, projectIds), gte(conversation.createdAt, since))),
    db
      .select({ n: countDistinct(agentRun.id) })
      .from(agentRun)
      .innerJoin(agentAction, eq(agentAction.runId, agentRun.id))
      .where(
        and(
          inArray(agentRun.projectId, projectIds),
          gte(agentRun.createdAt, since),
          eq(agentAction.status, "done"),
          ne(agentAction.name, "wait_for_user"),
        ),
      ),
    db.select({ n: count() }).from(project).where(eq(project.organizationId, organizationId)),
  ]);
  return { conversations: c?.n ?? 0, agentTasks: t?.n ?? 0, projects: p?.n ?? 0 };
}

export interface BillingState extends PlanState {
  subscription: Subscription;
  period: { start: Date; end: Date };
  usage: Usage;
}

export async function getBillingState(organizationId: string): Promise<BillingState> {
  const sub = await getSubscription(organizationId);
  const period = currentPeriod(sub);
  const usage = await getUsage(organizationId, period.start);
  return { ...effectivePlan(sub), subscription: sub, period, usage };
}

// Allowance checks run on every question, so cache them briefly per organization. Kept on globalThis
// because Next.js bundles route handlers and server actions separately; a module-level Map would
// give each its own copy, and clearing it from the Billing page wouldn't reach the chat endpoint.
type AllowanceCache = Map<string, { at: number; value: ReturnType<typeof assistantAllowance> }>;
const globalCache = globalThis as unknown as { clickyAllowanceCache?: AllowanceCache };
const allowanceCache = (globalCache.clickyAllowanceCache ??= new Map());

export async function getAllowance(organizationId: string) {
  const hit = allowanceCache.get(organizationId);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const state = await getBillingState(organizationId);
  const value = assistantAllowance(state.plan, state.usage);
  allowanceCache.set(organizationId, { at: Date.now(), value });
  return value;
}

export function clearAllowanceCache(organizationId: string) {
  allowanceCache.delete(organizationId);
}
