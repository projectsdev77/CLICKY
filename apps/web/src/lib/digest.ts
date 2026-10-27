import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { and, eq, inArray, member, organization, project, user } from "@clicky/db";
import { parseProjectSettings } from "@clicky/shared";
import { db } from "./db";
import { env } from "./env";
import { sendEmail } from "./email";
import { assistantProvider } from "./assistant";
import { getKnowledgeGaps, getOverview, getPageFriction, getTopics, type Overview, type PageFriction, type TopicRow } from "./analytics";

/**
 * The weekly insight digest: last week's numbers, what people asked about, what
 * Clicky couldn't answer, and where they struggled, plus a few suggestions.
 */

interface DigestData {
  projectName: string;
  overview: Overview;
  topics: TopicRow[];
  gaps: { content: string; topic: string | null }[];
  friction: PageFriction[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "n/a");

/** Three suggestions for the team, from Claude Haiku, or simple rules without a key. */
async function suggestions(data: DigestData): Promise<string[]> {
  if (assistantProvider() === "claude") {
    try {
      const client = new Anthropic();
      const res = await client.messages.parse({
        model: env.CLASSIFIER_MODEL,
        max_tokens: 2048,
        output_config: { effort: "low", format: zodOutputFormat(z.object({ suggestions: z.array(z.string()).max(3) })) },
        system:
          "You write the 'worth a look this week' section of a weekly email to a software product team. Given their in-app assistant's stats, give up to three short, specific, practical suggestions (one sentence each) for improving their product or help content. Refer to real topics, questions and pages from the data. No preamble.",
        messages: [{ role: "user", content: JSON.stringify(data) }],
      });
      if (res.stop_reason !== "refusal" && res.parsed_output?.suggestions.length) return res.parsed_output.suggestions;
    } catch (error) {
      console.error("[digest] suggestions failed", error instanceof Error ? error.message : error);
    }
  }
  const tips: string[] = [];
  const grower = [...data.topics].sort((a, b) => b.questions - b.previous - (a.questions - a.previous))[0];
  if (grower && grower.questions > grower.previous) {
    tips.push(`Questions about "${grower.label}" grew from ${grower.previous} to ${grower.questions}. Is something confusing there?`);
  }
  const unanswered = [...data.topics].sort((a, b) => b.unanswered - a.unanswered)[0];
  if (unanswered?.unanswered) {
    tips.push(`Clicky couldn't answer ${unanswered.unanswered} questions about "${unanswered.label}". A help article would fix that.`);
  }
  const page = data.friction.find((p) => p.formErrors + p.rageClicks + p.deadClicks + p.stuck > 0);
  if (page) tips.push(`${page.path} had the most signs of struggle (${page.formErrors} form errors, ${page.rageClicks} rage clicks).`);
  return tips;
}

export async function buildDigest(projectId: string): Promise<{ subject: string; text: string } | null> {
  const [proj] = await db.select().from(project).where(eq(project.id, projectId));
  if (!proj) return null;
  const [overview, topics, gaps, friction] = await Promise.all([
    getOverview(projectId, 7),
    getTopics(projectId, 7, 5),
    getKnowledgeGaps(projectId, 7, 5),
    getPageFriction(projectId, 7, 3),
  ]);
  if (overview.conversations === 0) return null;
  const data: DigestData = {
    projectName: proj.name,
    overview,
    topics,
    gaps: gaps.map((g) => ({ content: g.content, topic: g.topic })),
    friction,
  };
  const tips = await suggestions(data);
  const change = overview.previousConversations
    ? ` (${overview.conversations >= overview.previousConversations ? "up" : "down"} from ${overview.previousConversations})`
    : "";
  const lines = [
    `Here's how Clicky did in ${proj.name} over the last 7 days.`,
    "",
    `• ${plural(overview.conversations, "conversation")}${change}, ${plural(overview.people, "person")} helped`.replace("persons", "people"),
    `• ${pct(overview.helpful, overview.rated)} rated helpful`,
    `• ${plural(overview.tasksCompleted, "task")} done for users`,
    `• ${plural(overview.unanswered, "question")} Clicky couldn't answer`,
    "",
    ...(tips.length ? ["Worth a look:", ...tips.map((t) => `• ${t}`), ""] : []),
    ...(topics.length ? ["What people asked about:", ...topics.map((t) => `• ${t.label}: ${t.questions}${t.unanswered ? ` (${t.unanswered} unanswered)` : ""}`), ""] : []),
    ...(gaps.length ? ["Questions without a good answer:", ...gaps.map((g) => `• “${g.content}”`), ""] : []),
    `See everything: ${env.APP_URL}/projects/${proj.id}/overview`,
    "",
    `You get this because you're an owner or admin. Turn it off in the project's settings: ${env.APP_URL}/projects/${proj.id}/settings`,
  ];
  return { subject: `Clicky weekly: ${plural(overview.conversations, "conversation")} in ${proj.name}`, text: lines.join("\n") };
}

async function recipients(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, organizationId), inArray(member.role, ["owner", "admin"])));
  return rows.map((r) => r.email);
}

/** Sends this week's digest for every project that has it on and had activity. */
export async function sendWeeklyDigests() {
  const projects = await db
    .select({ id: project.id, settings: project.settings, organizationId: project.organizationId })
    .from(project)
    .innerJoin(organization, eq(project.organizationId, organization.id));
  let sent = 0;
  for (const p of projects) {
    if (!parseProjectSettings(p.settings).data.weeklyDigest) continue;
    const digest = await buildDigest(p.id);
    if (!digest) continue;
    for (const to of await recipients(p.organizationId)) {
      await sendEmail({ to, ...digest }).catch((error: unknown) => console.error("[digest] send failed", error));
      sent++;
    }
  }
  return { sent };
}
