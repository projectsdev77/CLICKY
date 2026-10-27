import { parseProjectSettings } from "@clicky/shared";
import { canManage, requireProject } from "@/lib/dal";
import { deleteWorkflow } from "@/app/actions";
import { Card } from "@/components/ui";
import { WorkflowForm } from "./workflow-form";

export default async function WorkflowsPage({ params }: PageProps<"/projects/[projectId]/workflows">) {
  const { projectId } = await params;
  const { project, role } = await requireProject(projectId);
  const manage = canManage(role);
  const { workflows } = parseProjectSettings(project.settings);

  return (
    <>
      <Card
        title="Workflows"
        description="Step-by-step procedures for common tasks, written the way you'd explain them to a new support agent. Clicky follows them when a user asks for that task: doing it for them, or walking them through it."
      >
        {workflows.length === 0 ? (
          <p className="text-sm text-muted">No workflows yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {workflows.map((w) => (
              <li key={w.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
                    {w.name}
                    {manage && (
                      <form action={deleteWorkflow.bind(null, project.id, w.id)}>
                        <button className="text-xs font-normal text-muted hover:text-red-600">Remove</button>
                      </form>
                    )}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{w.instructions}</p>
                  {manage && (
                    <div className="mt-3">
                      <WorkflowForm projectId={project.id} workflow={w} />
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {manage && (
        <Card title="Add a workflow">
          <WorkflowForm projectId={project.id} />
        </Card>
      )}
    </>
  );
}
