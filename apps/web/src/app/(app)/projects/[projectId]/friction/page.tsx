import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getPageFriction, getProblemElements, parseRange } from "@/lib/analytics";
import { Card } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";

export default async function FrictionPage({ params, searchParams }: PageProps<"/projects/[projectId]/friction">) {
  const { projectId } = await params;
  let days = parseRange((await searchParams).days);
  const { project } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  days = Math.min(days, plan.limits.analyticsDays) as typeof days;
  const [pages, elements] = await Promise.all([getPageFriction(project.id, days), getProblemElements(project.id, days)]);
  const maxScore = Math.max(1, ...pages.map((p) => p.score));
  const th = "px-2 py-2 text-left font-medium text-muted";
  const td = "px-2 py-2 tabular-nums";

  return (
    <>
      <RangeFilter maxDays={plan.limits.analyticsDays} days={days} basePath={`/projects/${project.id}/friction`} />
      <Card
        title="Where people struggle"
        description="Pages ranked by signs of struggle: rage clicks, clicks that do nothing, form errors, people stuck on a form, and questions asked."
      >
        {pages.length === 0 ? (
          <p className="text-sm text-muted">No data yet. Signals arrive as people use your app with Clicky installed.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Page</th>
                  <th className={th}>Views</th>
                  <th className={th}>Questions</th>
                  <th className={th}>Rage clicks</th>
                  <th className={th}>Dead clicks</th>
                  <th className={th}>Form errors</th>
                  <th className={th}>Stuck</th>
                  <th className={th}>Struggle / 100 views</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pages.map((p) => (
                  <tr key={p.path}>
                    <td className="max-w-48 truncate px-2 py-2 font-mono text-xs">{p.path}</td>
                    <td className={td}>{p.views}</td>
                    <td className={td}>{p.questions}</td>
                    <td className={td}>{p.rageClicks}</td>
                    <td className={td}>{p.deadClicks}</td>
                    <td className={td}>{p.formErrors}</td>
                    <td className={td}>{p.stuck}</td>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-16 rounded-full bg-grid">
                          <span className="block h-2 rounded-full bg-chart-1" style={{ width: `${(p.score / maxScore) * 100}%` }} />
                        </span>
                        {p.views ? p.score : "–"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Problem elements" description="The buttons, links and fields involved most often.">
        {elements.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Element</th>
                <th className={th}>Page</th>
                <th className={th}>Rage</th>
                <th className={th}>Dead</th>
                <th className={th}>Errors</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {elements.map((e) => (
                <tr key={`${e.path}|${e.element}`}>
                  <td className="max-w-64 truncate px-2 py-2">{e.element}</td>
                  <td className="px-2 py-2 font-mono text-xs">{e.path}</td>
                  <td className={td}>{e.rageClicks}</td>
                  <td className={td}>{e.deadClicks}</td>
                  <td className={td}>{e.formErrors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
