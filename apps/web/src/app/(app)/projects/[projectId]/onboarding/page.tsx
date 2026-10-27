import { parseProjectSettings } from "@clicky/shared";
import { canManage, requireProject } from "@/lib/dal";
import { getPlanState } from "@/lib/billing";
import { getOnboardingFunnel, parseRange } from "@/lib/analytics";
import { moveOnboardingStep, removeOnboardingStep } from "@/app/actions";
import { Card } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";
import { AddStepForm, OnboardingSettingsForm } from "./onboarding-forms";

const DONE_WHEN: Record<string, string> = { page: "Visits", click: "Clicks", event: "Your app tracks" };

export default async function OnboardingPage({ params, searchParams }: PageProps<"/projects/[projectId]/onboarding">) {
  const { projectId } = await params;
  let days = parseRange((await searchParams).days);
  const { project, role } = await requireProject(projectId);
  const { plan } = await getPlanState(project.organizationId);
  days = Math.min(days, plan.limits.analyticsDays) as typeof days;
  const manage = canManage(role);
  const { onboarding } = parseProjectSettings(project.settings);
  const funnel = await getOnboardingFunnel(project.id, onboarding.steps.map((s) => s.id), days);

  return (
    <>
      <Card
        title="Onboarding checklist"
        description="New users see a short checklist in Clicky. Each step has a “Show me” button, and ticks itself off when they do it."
      >
        <OnboardingSettingsForm projectId={project.id} settings={onboarding} disabled={!manage} />
      </Card>

      <Card title="Steps">
        {onboarding.steps.length === 0 ? (
          <p className="text-sm text-muted">No steps yet.</p>
        ) : (
          <ol className="divide-y divide-border">
            {onboarding.steps.map((step, i) => {
              const done = funnel.steps.find((f) => f.id === step.id)?.completed ?? 0;
              const pct = funnel.users ? Math.round((done / funnel.users) * 100) : 0;
              return (
                <li key={step.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {i + 1}. {step.title}
                    </p>
                    <p className="truncate text-xs text-muted">
                      Done when: {DONE_WHEN[step.doneWhen.type]} <code className="font-mono">{step.doneWhen.value}</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-2" title={`${done} of ${funnel.users} new users`}>
                    <span className="h-2 flex-1 rounded-full bg-grid">
                      <span className="block h-2 rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-20 text-xs tabular-nums text-muted">
                      {pct}% ({done})
                    </span>
                  </div>
                  {manage && (
                    <div className="flex gap-3 text-xs">
                      {i > 0 && (
                        <form action={moveOnboardingStep.bind(null, project.id, step.id)}>
                          <button className="text-muted hover:text-foreground">Move up</button>
                        </form>
                      )}
                      <form action={removeOnboardingStep.bind(null, project.id, step.id)}>
                        <button className="text-muted hover:text-red-600">Remove</button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>Completion among {funnel.users} users first seen in this period.</span>
          <RangeFilter maxDays={plan.limits.analyticsDays} days={days} basePath={`/projects/${project.id}/onboarding`} />
        </div>
      </Card>

      {manage && onboarding.steps.length < 10 && (
        <Card title="Add a step">
          <AddStepForm projectId={project.id} />
        </Card>
      )}
    </>
  );
}
