import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getDailyConversations, getOverview, getTopics, getTopicsBySegment, getTraitKeys, parseRange } from "@/lib/analytics";
import Link from "next/link";
import { Card } from "@/components/ui";
import { Stat } from "@/components/stat";
import { DailyColumns, RankedBars } from "@/components/charts";
import { RangeFilter } from "@/components/range-filter";
import { DigestPreviewButton } from "./digest-preview";

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

export default async function OverviewPage({ params, searchParams }: PageProps<"/projects/[projectId]/overview">) {
  const { projectId } = await params;
  let days = parseRange((await searchParams).days);
  const { project } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  days = Math.min(days, plan.limits.analyticsDays) as typeof days;
  const query = await searchParams;
  const [o, daily, topics, traitKeys] = await Promise.all([
    getOverview(project.id, days),
    getDailyConversations(project.id, days),
    getTopics(project.id, days),
    getTraitKeys(project.id),
  ]);
  const trait = typeof query.trait === "string" && traitKeys.includes(query.trait) ? query.trait : traitKeys[0];
  const segments = trait ? await getTopicsBySegment(project.id, days, trait) : null;
  const maxCell = Math.max(1, ...(segments?.rows.flatMap((r) => Object.values(r.counts)) ?? [1]));
  const base = `/projects/${project.id}`;

  if (o.conversations === 0 && o.previousConversations === 0) {
    return (
      <Card title="No conversations yet" description="Once people start asking Clicky questions, you'll see what they ask about and where they get stuck here.">
        <Link href={`${base}/install`} className="text-sm text-brand-ink">
          Check your installation →
        </Link>
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeFilter maxDays={plan.limits.analyticsDays} days={days} basePath={`${base}/overview`} />
        <DigestPreviewButton projectId={project.id} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:row-span-2">
          <Stat
            hero
            label="Conversations"
            value={o.conversations.toLocaleString()}
            delta={o.previousConversations ? o.conversations / o.previousConversations - 1 : null}
            hint={`${o.people.toLocaleString()} people helped`}
          />
        </div>
        <Stat label="Rated helpful" value={pct(o.helpful, o.rated)} hint={`${o.rated} rated`} />
        <Stat label="Tasks done for users" value={o.tasksCompleted.toLocaleString()} hint={`${o.actionsDone} actions taken`} />
        <Stat label="Asked by voice" value={pct(o.voiceConversations, o.conversations)} />
        <Stat
          label="Couldn't answer"
          value={o.unanswered.toLocaleString()}
          hint={o.questions ? `${pct(o.unanswered, o.questions)} of ${o.questions} questions` : undefined}
        />
      </div>

      <Card title="Conversations per day">
        <DailyColumns data={daily} unit="conversations" />
      </Card>

      <Card title="What people ask about" description="Questions grouped automatically. Click a topic to read the conversations.">
        {topics.length === 0 ? (
          <p className="text-sm text-muted">Topics appear a minute or so after the first questions come in.</p>
        ) : (
          <RankedBars
            rows={topics.map((t) => ({
              key: t.id,
              value: t.questions,
              label: (
                <Link href={`${base}/conversations?topic=${t.id}&days=${days}`} className="hover:underline">
                  {t.label}
                </Link>
              ),
              note: [
                t.unanswered ? `${t.unanswered} unanswered` : null,
                t.previous ? `${t.questions >= t.previous ? "▲" : "▼"} from ${t.previous}` : "new",
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        )}
      </Card>

      {segments && segments.rows.length > 0 && (
        <Card
          title="Who asks about what"
          description="Questions per topic, by a trait your app passes to Clicky.identify(). Useful for spotting what each kind of customer struggles to discover."
        >
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Split by">
            {traitKeys.map((k) => (
              <Link
                key={k}
                href={`${base}/overview?days=${days}&trait=${encodeURIComponent(k)}`}
                aria-current={k === trait ? "true" : undefined}
                className={`rounded-full border px-3 py-1 text-xs ${k === trait ? "border-brand text-brand-ink" : "border-border text-muted"}`}
              >
                {k}
              </Link>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Questions per topic by {trait}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-2 py-2 text-left font-medium text-muted">Topic</th>
                  {segments.segments.map((seg) => (
                    <th key={seg} scope="col" className="px-2 py-2 text-right font-medium text-muted">
                      {seg}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segments.rows.map((r) => (
                  <tr key={r.topic} className="border-b border-border">
                    <th scope="row" className="px-2 py-2 text-left font-normal">{r.topic}</th>
                    {segments.segments.map((seg) => {
                      const n = r.counts[seg] ?? 0;
                      return (
                        <td key={seg} className="px-1 py-1 text-right tabular-nums">
                          <span
                            className="block rounded px-2 py-1"
                            style={{ background: n ? `color-mix(in srgb, var(--chart-1) ${Math.round(8 + (n / maxCell) * 40)}%, transparent)` : undefined }}
                          >
                            {n || "–"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
