import Link from "next/link";
import { requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getDailyConversations, getOverview, getTopics, parseRange } from "@/lib/analytics";
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
  const [o, daily, topics] = await Promise.all([
    getOverview(project.id, days),
    getDailyConversations(project.id, days),
    getTopics(project.id, days),
  ]);
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
    </>
  );
}
