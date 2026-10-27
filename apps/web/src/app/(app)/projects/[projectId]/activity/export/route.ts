import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getActivity, parseRange } from "@/lib/analytics";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET(request: Request, { params }: RouteContext<"/projects/[projectId]/activity/export">) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  const days = Math.min(parseRange(new URL(request.url).searchParams.get("days") ?? undefined), plan.limits.analyticsDays);
  const rows = await getActivity(project.id, days, 10_000);
  const csv = toCsv(
    ["time", "user_id", "action", "step", "page", "status", "asked_first", "result", "conversation_id"],
    rows.map((a) => [
      new Date(a.created_at).toISOString(),
      a.external_id,
      a.name,
      a.description,
      a.page_url,
      a.status,
      a.needs_confirmation,
      a.output,
      a.conversation_id,
    ]),
  );
  return csvResponse(`clicky-activity-${days}d.csv`, csv);
}
