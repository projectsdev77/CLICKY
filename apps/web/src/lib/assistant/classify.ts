import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { agentRun, and, asc, desc, eq, inArray, isNull, message, sql, topic } from "@clicky/db";
import { stripMarkers } from "@clicky/shared";
import { db } from "../db";
import { env } from "../env";
import { assistantProvider } from "./index";

/**
 * Background job: groups each user question into a topic ("Exporting reports")
 * and records whether Clicky could answer it. Unanswered questions are the
 * project's knowledge gaps.
 */

const resultSchema = z.object({
  topic: z.string().describe("Short topic label, 1-4 words, Title Case"),
  answered: z.boolean(),
});
type Classification = z.infer<typeof resultSchema>;

let client: Anthropic | null = null;

async function classifyWithClaude(question: string, answer: string, existing: string[]): Promise<Classification | null> {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: env.CLASSIFIER_MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(resultSchema) },
    system:
      "You sort questions that users asked an in-app assistant into topics for the product team, and judge whether the assistant actually answered. Reuse an existing topic label when one fits; otherwise create a short new one (1-4 words, Title Case, about the user's goal, e.g. \"Exporting Reports\"). answered is false when the assistant said it didn't know, gave a generic non-answer, or the user's need clearly wasn't met.",
    messages: [
      {
        role: "user",
        content: `Existing topics: ${existing.length ? existing.join(" | ") : "(none yet)"}\n\n<question>${question}</question>\n<assistant_answer>${answer || "(no answer)"}</assistant_answer>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}

const STOP = new Set(
  "a an the to of in on for and or how do does i can you me my is it this that where what why when with please want find get set use go see show could would should there their our your am are be".split(
    " ",
  ),
);

/** Offline stand-in: topic from the question's key words; "answered" from the reply. */
function classifyLocally(question: string, answer: string, existing: string[]): Classification {
  const keys = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const match = existing.find((t) => keys.some((k) => t.toLowerCase().includes(k.replace(/s$/, ""))));
  const label = match ?? (keys.slice(0, 2).map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ") || "General");
  return { topic: label, answered: !!answer && !/not sure|don't know|can't help|didn't work/i.test(answer) };
}

async function topicId(projectId: string, label: string): Promise<string> {
  const clean = label.trim().slice(0, 60) || "General";
  await db.insert(topic).values({ id: crypto.randomUUID(), projectId, label: clean }).onConflictDoNothing();
  const [row] = await db
    .select({ id: topic.id })
    .from(topic)
    .where(and(eq(topic.projectId, projectId), sql`lower(${topic.label}) = lower(${clean})`));
  return row!.id;
}

/** Classifies every not-yet-classified question in a conversation. Safe to run more than once. */
export async function classifyConversation(projectId: string, conversationId: string) {
  try {
    const [active] = await db
      .select({ id: agentRun.id })
      .from(agentRun)
      .where(and(eq(agentRun.conversationId, conversationId), inArray(agentRun.status, ["running", "waiting"])))
      .limit(1);
    if (active) return; // the task is still going; classify when it's done
    const rows = await db
      .select({ id: message.id, role: message.role, content: message.content, topicId: message.topicId })
      .from(message)
      .where(eq(message.conversationId, conversationId))
      .orderBy(asc(message.createdAt));
    const pending = rows
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.role === "user" && !m.topicId);
    if (pending.length === 0) return;
    const existing = (
      await db.select({ label: topic.label }).from(topic).where(eq(topic.projectId, projectId)).orderBy(desc(topic.createdAt)).limit(60)
    ).map((t) => t.label);

    for (const { m, i } of pending) {
      const answerParts: string[] = [];
      for (const next of rows.slice(i + 1)) {
        if (next.role === "user") break;
        answerParts.push(stripMarkers(next.content));
      }
      // Wait until the reply has arrived (the run may still be going).
      if (answerParts.length === 0 && i === rows.length - 1) continue;
      const answer = answerParts.join(" ").slice(0, 2000);
      const result =
        assistantProvider() === "stub"
          ? classifyLocally(m.content, answer, existing)
          : await classifyWithClaude(m.content, answer, existing).catch((error: unknown) => {
              console.error("[classify] failed", error instanceof Error ? error.message : error);
              return null;
            });
      if (!result) continue;
      const id = await topicId(projectId, result.topic);
      if (!existing.includes(result.topic)) existing.unshift(result.topic);
      await db
        .update(message)
        .set({ topicId: id, answered: result.answered })
        .where(and(eq(message.id, m.id), isNull(message.topicId)));
    }
  } catch (error) {
    console.error("[classify] error", error);
  }
}
