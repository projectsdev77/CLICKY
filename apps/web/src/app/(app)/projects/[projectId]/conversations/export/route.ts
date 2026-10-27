import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getConversationsForExport, parseRange } from "@/lib/analytics";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(request: Request, { params }: RouteContext<"/projects/[projectId]/conversations/export">) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  const days = Math.min(parseRange(new URL(request.url).searchParams.get("days") ?? undefined), plan.limits.analyticsDays);
  const rows = await getConversationsForExport(project.id, days);
  const csv = toCsv(
    ["started", "conversation_id", "user_id", "first_question", "questions", "topics", "voice", "mode", "rating", "outcome", "page"],
    rows.map((c) => [
      new Date(c.created_at).toISOString(),
      c.id,
      c.external_id,
      c.first_question,
      c.questions,
      c.topics,
      c.voice,
      c.mode,
      c.feedback === 1 ? "helpful" : c.feedback === -1 ? "not helpful" : "",
      c.outcome,
      c.entry_url,
    ]),
  );
  return csvResponse(`clicky-conversations-${days}d.csv`, csv);
}
