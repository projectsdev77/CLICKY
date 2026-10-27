/**
 * Fills the demo project with 30 days of made-up activity so the Overview,
 * Friction and Knowledge pages have something to show. Demo/dev only.
 * Re-running replaces the previous demo data. Usage: pnpm db:seed-analytics
 */
import { agentAction, agentRun, conversation, createDb, endUser, eq, event, like, message, topic } from "@clicky/db";

const db = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/clicky");
const PROJECT = "seed-project";

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;

const TOPICS = [
  { label: "Exporting Reports", path: "/reports", weight: 9, questions: ["How do I export this as Excel?", "Can I export all reports at once?", "Where's the export button?", "Export to PDF please"] },
  { label: "Changing Plans", path: "/billing", weight: 6, questions: ["How do I upgrade to Growth?", "What's the difference between plans?", "Switch me to the Scale plan"] },
  { label: "Timezone Settings", path: "/settings", weight: 5, questions: ["Why won't my settings save?", "How do I change my timezone?", "Dates in reports look wrong"] },
  { label: "Updating Payment Card", path: "/billing", weight: 3, questions: ["How do I update my card?", "My card expired, what now?"] },
  { label: "Weekly Digest Email", path: "/settings", weight: 2, questions: ["How do I stop the weekly email?", "Can I get the digest daily instead?"] },
  { label: "API Access", path: "/", weight: 2, questions: ["Do you have an API?", "How do I get an API key?"], unanswered: true },
];

// Clear previous demo data.
await db.delete(endUser).where(like(endUser.anonymousId, "demo-%"));
await db.delete(event).where(like(event.sessionId, "demo-%"));

const topicIds = new Map<string, string>();
for (const t of TOPICS) {
  await db.insert(topic).values({ id: crypto.randomUUID(), projectId: PROJECT, label: t.label }).onConflictDoNothing();
  const [row] = await db.select().from(topic).where(eq(topic.label, t.label));
  topicIds.set(t.label, row!.id);
}

const users = Array.from({ length: 60 }, (_, i) => ({
  id: crypto.randomUUID(),
  projectId: PROJECT,
  anonymousId: `demo-${i}`,
  externalId: i % 3 === 0 ? `user_${1000 + i}` : null,
  traits: {},
}));
await db.insert(endUser).values(users);

const weighted = TOPICS.flatMap((t) => Array(t.weight).fill(t) as (typeof TOPICS)[number][]);
const now = Date.now();
for (let day = 29; day >= 0; day--) {
  const perDay = Math.round(4 + rand() * 6 + (29 - day) * 0.25);
  for (let n = 0; n < perDay; n++) {
    const t = pick(weighted);
    const user = pick(users);
    const at = new Date(now - day * 86_400_000 - Math.floor(rand() * 80_000_000));
    const convoId = crypto.randomUUID();
    const voice = rand() < 0.35;
    const helpful = t.unanswered ? -1 : rand() < 0.78 ? 1 : rand() < 0.5 ? -1 : null;
    await db.insert(conversation).values({
      id: convoId,
      projectId: PROJECT,
      endUserId: user.id,
      mode: rand() < 0.4 ? "agent" : "ask",
      entryUrl: `http://localhost:5173${t.path}`,
      feedback: helpful,
      feedbackAt: helpful ? at : null,
      outcome: helpful === 1 ? "resolved" : helpful === -1 ? "unresolved" : null,
      createdAt: at,
    });
    await db.insert(message).values([
      { id: crypto.randomUUID(), conversationId: convoId, role: "user", content: pick(t.questions), inputMode: voice ? "voice" : "text", pageUrl: `http://localhost:5173${t.path}`, topicId: topicIds.get(t.label), answered: !t.unanswered, createdAt: at },
      { id: crypto.randomUUID(), conversationId: convoId, role: "assistant", content: t.unanswered ? "I'm not sure about that one." : "Here's how. {{point:e1}}", pageUrl: `http://localhost:5173${t.path}`, createdAt: new Date(at.getTime() + 2000) },
    ]);
    if (rand() < 0.4 && !t.unanswered) {
      const runId = crypto.randomUUID();
      await db.insert(agentRun).values({ id: runId, conversationId: convoId, projectId: PROJECT, endUserId: user.id, status: "completed", messages: "[]", steps: 1, createdAt: at });
      await db.insert(agentAction).values({ id: `toolu_demo_${runId}`, runId, projectId: PROJECT, name: "click", description: "Click Export", input: {}, status: "done", output: "done", pageUrl: t.path, createdAt: at, completedAt: at });
    }
  }
}

// Behaviour signals.
const PAGES = [
  { path: "/", views: 900 },
  { path: "/reports", views: 700, rage: [["button \"Export\"", 18]], dead: [["text \"Weekly traffic\"", 25]] },
  { path: "/settings", views: 300, errors: [["message \"Choose a timezone.\"", 64]], stuck: 22 },
  { path: "/billing", views: 200, rage: [["button \"Update card\"", 9]], errors: [["textbox \"Expiry\"", 14]], stuck: 11 },
] as const;
const rows: (typeof event.$inferInsert)[] = [];
const ev = (type: string, path: string, element: string | null = null) =>
  rows.push({ id: crypto.randomUUID(), projectId: PROJECT, sessionId: `demo-${Math.floor(rand() * 400)}`, type, path, element, props: {}, createdAt: new Date(now - Math.floor(rand() * 29 * 86_400_000)) });
for (const p of PAGES) {
  for (let i = 0; i < p.views; i++) ev("pageview", p.path);
  for (const [el, n] of "rage" in p ? p.rage : []) for (let i = 0; i < n; i++) ev("rage_click", p.path, el);
  for (const [el, n] of "dead" in p ? p.dead : []) for (let i = 0; i < n; i++) ev("dead_click", p.path, el);
  for (const [el, n] of "errors" in p ? p.errors : []) for (let i = 0; i < n; i++) ev("form_error", p.path, el);
  for (let i = 0; i < ("stuck" in p ? p.stuck : 0); i++) ev("form_stuck", p.path, "form");
}
for (let i = 0; i < rows.length; i += 500) await db.insert(event).values(rows.slice(i, i + 500));
console.log(`Seeded demo analytics: ${users.length} users, ${rows.length} events`);
process.exit(0);
