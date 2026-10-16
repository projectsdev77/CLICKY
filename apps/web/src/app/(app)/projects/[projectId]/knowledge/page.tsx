import { desc, eq, knowledgeSource } from "@clicky/db";
import { db } from "@/lib/db";
import { canManage, requireProject } from "@/lib/dal";
import { deleteSource, resyncSource } from "@/app/actions";
import { Card } from "@/components/ui";
import { AddTextForm, AddUrlForm, RefreshWhileSyncing } from "./knowledge-forms";

const STATUS: Record<string, string> = { pending: "Queued", syncing: "Reading…", ready: "Ready", error: "Failed" };

export default async function KnowledgePage({ params }: PageProps<"/projects/[projectId]/knowledge">) {
  const { projectId } = await params;
  const { project, role } = await requireProject(projectId);
  const manage = canManage(role);
  const sources = await db
    .select()
    .from(knowledgeSource)
    .where(eq(knowledgeSource.projectId, project.id))
    .orderBy(desc(knowledgeSource.createdAt));
  const syncing = sources.some((s) => s.status === "pending" || s.status === "syncing");

  return (
    <>
      <RefreshWhileSyncing active={syncing} />
      <Card
        title="What Clicky knows"
        description="Clicky reads these alongside the page your user is on, so it can explain how your product works."
      >
        {sources.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet. Add your help center or paste an article below.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="truncate text-xs text-muted">
                    {s.type === "url" ? s.url : "Pasted text"} · {STATUS[s.status]}
                    {s.status === "ready" && s.type === "url" && ` · ${s.pageCount} pages`}
                    {s.lastSyncedAt && ` · updated ${s.lastSyncedAt.toLocaleDateString()}`}
                  </p>
                  {s.error && <p className="text-xs text-red-600">{s.error}</p>}
                </div>
                {manage && (
                  <div className="flex gap-3 text-xs">
                    {s.type === "url" && (
                      <form action={resyncSource.bind(null, project.id, s.id)}>
                        <button className="text-muted hover:text-foreground">Refresh</button>
                      </form>
                    )}
                    <form action={deleteSource.bind(null, project.id, s.id)}>
                      <button className="text-muted hover:text-red-600">Remove</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {manage && (
        <>
          <Card title="Add your help center" description="We'll read up to 30 pages under this address.">
            <AddUrlForm projectId={project.id} />
          </Card>
          <Card title="Paste an article" description="FAQs, internal how-tos, anything your support team would say.">
            <AddTextForm projectId={project.id} />
          </Card>
        </>
      )}
    </>
  );
}
