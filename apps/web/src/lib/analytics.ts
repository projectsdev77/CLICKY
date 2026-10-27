import "server-only";
import { sql } from "@clicky/db";
import { db } from "./db";

/**
 * Read-side queries for the product team's dashboard. Raw SQL keeps the
 * aggregations readable; every query is scoped to one project and a time range.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function parseRange(value: string | string[] | undefined): RangeDays {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

/** Start of the selected range. */
export function rangeStart(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

/** Range bounds as ISO strings (raw SQL parameters must be strings for the postgres driver). */
function window(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const prevFrom = new Date(from.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString() };
}

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export interface Overview {
  conversations: number;
  previousConversations: number;
  people: number;
  voiceConversations: number;
  rated: number;
  helpful: number;
  tasksCompleted: number;
  actionsDone: number;
  questions: number;
  unanswered: number;
}

export async function getOverview(projectId: string, days: number): Promise<Overview> {
  const { from, to, prevFrom } = window(days);
  const [c] = await rows<Record<string, string | number>>(sql`
    select
      count(*) filter (where c.created_at >= ${from}) as conversations,
      count(*) filter (where c.created_at < ${from}) as previous_conversations,
      count(distinct c.end_user_id) filter (where c.created_at >= ${from}) as people,
      count(*) filter (where c.created_at >= ${from} and c.feedback is not null) as rated,
      count(*) filter (where c.created_at >= ${from} and c.feedback = 1) as helpful,
      count(*) filter (where c.created_at >= ${from} and exists (
        select 1 from message m where m.conversation_id = c.id and m.input_mode = 'voice')) as voice_conversations
    from conversation c
    where c.project_id = ${projectId} and c.created_at >= ${prevFrom} and c.created_at <= ${to}`);
  const [a] = await rows<Record<string, string | number>>(sql`
    select
      count(distinct r.id) filter (where r.status = 'completed' and exists (
        select 1 from agent_action x where x.run_id = r.id and x.status = 'done' and x.name <> 'wait_for_user')) as tasks_completed,
      (select count(*) from agent_action x where x.project_id = ${projectId} and x.status = 'done'
        and x.name <> 'wait_for_user' and x.created_at >= ${from}) as actions_done
    from agent_run r
    where r.project_id = ${projectId} and r.created_at >= ${from}`);
  const [q] = await rows<Record<string, string | number>>(sql`
    select count(*) as questions, count(*) filter (where m.answered = false) as unanswered
    from message m join conversation c on c.id = m.conversation_id
    where c.project_id = ${projectId} and m.role = 'user' and m.created_at >= ${from}`);
  const n = (v: unknown) => Number(v ?? 0);
  return {
    conversations: n(c?.conversations),
    previousConversations: n(c?.previous_conversations),
    people: n(c?.people),
    voiceConversations: n(c?.voice_conversations),
    rated: n(c?.rated),
    helpful: n(c?.helpful),
    tasksCompleted: n(a?.tasks_completed),
    actionsDone: n(a?.actions_done),
    questions: n(q?.questions),
    unanswered: n(q?.unanswered),
  };
}

/** Conversations per day, with zero-filled days, oldest first. */
export async function getDailyConversations(projectId: string, days: number) {
  const result = await rows<{ day: string; count: string }>(sql`
    select to_char(d.day, 'YYYY-MM-DD') as day, count(c.id) as count
    from generate_series(current_date - (${days - 1}::int), current_date, interval '1 day') as d(day)
    left join conversation c
      on c.project_id = ${projectId} and c.created_at >= d.day and c.created_at < d.day + interval '1 day'
    group by d.day order by d.day`);
  return result.map((r) => ({ day: r.day, count: Number(r.count) }));
}

export interface TopicRow {
  id: string;
  label: string;
  questions: number;
  previous: number;
  unanswered: number;
}

export async function getTopics(projectId: string, days: number, limit = 10): Promise<TopicRow[]> {
  const { from, prevFrom } = window(days);
  const result = await rows<Record<string, string>>(sql`
    select t.id, t.label,
      count(*) filter (where m.created_at >= ${from}) as questions,
      count(*) filter (where m.created_at < ${from}) as previous,
      count(*) filter (where m.created_at >= ${from} and m.answered = false) as unanswered
    from message m
    join topic t on t.id = m.topic_id
    where t.project_id = ${projectId} and m.role = 'user' and m.created_at >= ${prevFrom}
    group by t.id, t.label
    having count(*) filter (where m.created_at >= ${from}) > 0
    order by questions desc, t.label
    limit ${limit}`);
  return result.map((r) => ({
    id: r.id!,
    label: r.label!,
    questions: Number(r.questions),
    previous: Number(r.previous),
    unanswered: Number(r.unanswered),
  }));
}

export async function getKnowledgeGaps(projectId: string, days: number, limit = 25) {
  const { from } = window(days);
  return rows<{ id: string; content: string; conversation_id: string; created_at: Date; topic: string | null; page_url: string | null }>(sql`
    select m.id, m.content, m.conversation_id, m.created_at, m.page_url, t.label as topic
    from message m
    join conversation c on c.id = m.conversation_id
    left join topic t on t.id = m.topic_id
    where c.project_id = ${projectId} and m.role = 'user' and m.answered = false and m.created_at >= ${from}
    order by m.created_at desc
    limit ${limit}`);
}

export interface PageFriction {
  path: string;
  views: number;
  questions: number;
  rageClicks: number;
  deadClicks: number;
  formErrors: number;
  stuck: number;
  /** Struggle signals per 100 page views. */
  score: number;
}

export async function getPageFriction(projectId: string, days: number, limit = 20): Promise<PageFriction[]> {
  const { from } = window(days);
  const result = await rows<Record<string, string>>(sql`
    with signals as (
      select path,
        count(*) filter (where type = 'pageview') as views,
        count(*) filter (where type = 'rage_click') as rage,
        count(*) filter (where type = 'dead_click') as dead,
        count(*) filter (where type = 'form_error') as form_errors,
        count(*) filter (where type = 'form_stuck') as stuck
      from event where project_id = ${projectId} and created_at >= ${from}
      group by path
    ), questions as (
      select regexp_replace(m.page_url, '^https?://[^/]+', '') as path, count(*) as questions
      from message m join conversation c on c.id = m.conversation_id
      where c.project_id = ${projectId} and m.role = 'user' and m.created_at >= ${from} and m.page_url is not null
      group by 1
    )
    select coalesce(s.path, q.path) as path,
      coalesce(s.views, 0) as views, coalesce(q.questions, 0) as questions,
      coalesce(s.rage, 0) as rage, coalesce(s.dead, 0) as dead,
      coalesce(s.form_errors, 0) as form_errors, coalesce(s.stuck, 0) as stuck
    from signals s full outer join questions q on q.path = s.path`);
  return result
    .map((r) => {
      const views = Number(r.views);
      const signals = Number(r.rage) + Number(r.dead) + Number(r.form_errors) + Number(r.stuck);
      return {
        path: r.path || "/",
        views,
        questions: Number(r.questions),
        rageClicks: Number(r.rage),
        deadClicks: Number(r.dead),
        formErrors: Number(r.form_errors),
        stuck: Number(r.stuck),
        score: views ? Math.round((signals / views) * 1000) / 10 : 0,
      };
    })
    .filter((p) => p.views + p.questions > 0)
    .sort((a, b) => b.rageClicks + b.deadClicks + b.formErrors + b.stuck + b.questions - (a.rageClicks + a.deadClicks + a.formErrors + a.stuck + a.questions))
    .slice(0, limit);
}

export async function getProblemElements(projectId: string, days: number, limit = 15) {
  const { from } = window(days);
  const result = await rows<Record<string, string>>(sql`
    select path, element,
      count(*) filter (where type = 'rage_click') as rage,
      count(*) filter (where type = 'dead_click') as dead,
      count(*) filter (where type = 'form_error') as form_errors,
      count(*) as total
    from event
    where project_id = ${projectId} and created_at >= ${from}
      and type in ('rage_click', 'dead_click', 'form_error') and element is not null
    group by path, element
    order by total desc
    limit ${limit}`);
  return result.map((r) => ({
    path: r.path!,
    element: r.element!,
    rageClicks: Number(r.rage),
    deadClicks: Number(r.dead),
    formErrors: Number(r.form_errors),
    total: Number(r.total),
  }));
}

/** Of users first seen in the range, how many completed each onboarding step. */
export async function getOnboardingFunnel(projectId: string, stepIds: string[], days: number) {
  const { from } = window(days);
  const [total] = await rows<{ n: string }>(sql`
    select count(*) as n from end_user where project_id = ${projectId} and first_seen_at >= ${from}`);
  const counts = await rows<{ step_id: string; n: string }>(sql`
    select oc.step_id, count(*) as n
    from onboarding_completion oc join end_user u on u.id = oc.end_user_id
    where oc.project_id = ${projectId} and u.first_seen_at >= ${from}
    group by oc.step_id`);
  const byStep = new Map(counts.map((c) => [c.step_id, Number(c.n)]));
  return { users: Number(total?.n ?? 0), steps: stepIds.map((id) => ({ id, completed: byStep.get(id) ?? 0 })) };
}
