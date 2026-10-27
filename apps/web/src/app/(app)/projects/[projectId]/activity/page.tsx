import Link from "next/link";
import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getActivity, parseRange } from "@/lib/analytics";
import { Card } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";

const STATUS: Record<string, string> = {
  done: "Done",
  failed: "Failed",
  declined: "User said no",
  blocked: "Blocked by settings",
  skipped: "Skipped",
  timeout: "User didn't do it in time",
};

export default async function ActivityPage({ params, searchParams }: PageProps<"/projects/[projectId]/activity">) {
  const { projectId } = await params;
  let days = parseRange((await searchParams).days);
  const { project } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  days = Math.min(days, plan.limits.analyticsDays) as typeof days;
  const actions = await getActivity(project.id, days);
  const th = "px-2 py-2 text-left font-medium text-muted";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeFilter maxDays={plan.limits.analyticsDays} days={days} basePath={`/projects/${project.id}/activity`} />
        <a href={`/projects/${project.id}/activity/export?days=${days}`} className="text-sm text-brand-ink">
          Download CSV
        </a>
      </div>
      <Card title="Activity" description="Every step Clicky took in your app, newest first: an audit log.">
        {actions.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>User</th>
                  <th className={th}>Step</th>
                  <th className={th}>Page</th>
                  <th className={th}>Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {actions.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-muted">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="px-2 py-2 text-xs">{a.external_id ?? "Anonymous"}</td>
                    <td className="px-2 py-2">
                      <Link href={`/projects/${project.id}/conversations/${a.conversation_id}`} className="hover:underline">
                        {a.description}
                      </Link>
                      {a.needs_confirmation && <span className="ml-1 text-xs text-muted">· asked first</span>}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{a.page_url}</td>
                    <td className="px-2 py-2 text-xs">
                      {STATUS[a.status ?? ""] ?? "Not finished"}
                      {a.status && a.status !== "done" && a.output && <span className="block text-muted">{a.output}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
