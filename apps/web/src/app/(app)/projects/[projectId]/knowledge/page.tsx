import { desc, eq, knowledgeSource } from "@clicky/db";
import { db } from "@/lib/db";
import { getKnowledgeGaps } from "@/lib/analytics";
import Link from "next/link";
import { canManage, requireProject } from "@/lib/dal";
import { deleteSource, resyncSource } from "@/app/actions";
import { Card } from "@/components/ui";
import { AddTextForm, AddUrlForm, RefreshWhileSyncing } from "./knowledge-forms";

const STATUS: Record<string, string> = { pending: "Queued", syncing: "Reading…", ready: "Ready", error: "Failed" };

export default async function KnowledgePage({ params, searchParams }: PageProps<"/projects/[projectId]/knowledge">) {
  const { projectId } = await params;
  const prefill = (await searchParams).question;
  const { project, role } = await requireProject(projectId);
  const manage = canManage(role);
  const sources = await db
    .select()
    .from(knowledgeSource)
    .where(eq(knowledgeSource.projectId, project.id))
    .orderBy(desc(knowledgeSource.createdAt));
  const gaps = await getKnowledgeGaps(project.id, 30);
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
      <Card
        title="Questions Clicky couldn't answer"
        description="From the last 30 days. Write an answer and Clicky will use it next time."
      >
        {gaps.length === 0 ? (
          <p className="text-sm text-muted">None. Nice.</p>
        ) : (
          <ul className="divide-y divide-border">
            {gaps.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{g.content}</span>
                  <span className="text-xs text-muted">
                    {g.topic ?? "Unsorted"} ·{" "}
                    <Link className="hover:underline" href={`/projects/${project.id}/conversations/${g.conversation_id}`}>
                      view conversation
                    </Link>
                  </span>
                </span>
                {manage && (
                  <Link
                    href={`/projects/${project.id}/knowledge?question=${encodeURIComponent(g.content)}#article`}
                    className="text-xs text-brand"
                  >
                    Write an answer
                  </Link>
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
            <AddTextForm projectId={project.id} title={typeof prefill === "string" ? prefill : undefined} />
          </Card>
        </>
      )}
    </>
  );
}
