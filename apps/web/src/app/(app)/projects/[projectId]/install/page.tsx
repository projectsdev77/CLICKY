import { canManage, requireProject } from "@/lib/dal";
import { env } from "@/lib/env";
import { Card } from "@/components/ui";
import { CopyBlock } from "@/components/copy-block";
import { InstallStatus } from "./install-status";
import { OriginsForm } from "./origins-form";

export default async function InstallPage({ params }: PageProps<"/projects/[projectId]/install">) {
  const { projectId } = await params;
  const { project, role } = await requireProject(projectId);

  const scriptSnippet = `<script src="${env.APP_URL}/sdk/v1/clicky.js" data-key="${project.publicKey}" async></script>`;
  const npmSnippet = `import { Clicky } from "@clicky/sdk";

Clicky.init({ projectKey: "${project.publicKey}" });

// Optional: tell Clicky who the user is
Clicky.identify({ userId: currentUser.id, traits: { plan: currentUser.plan } });`;

  return (
    <>
      <InstallStatus
        projectId={project.id}
        initial={{ lastSeenAt: project.lastSeenAt?.toISOString() ?? null, lastSeenUrl: project.lastSeenUrl }}
      />

      <Card
        title="1. Add your website"
        description="Clicky only loads on these websites. Use *.acme.com to allow every subdomain."
      >
        <OriginsForm
          projectId={project.id}
          origins={project.allowedOrigins}
          disabled={!canManage(role)}
        />
      </Card>

      <Card
        title="2. Add the script"
        description={<>Paste this before the closing <code>&lt;/body&gt;</code> tag of every page in your app.</>}
      >
        <CopyBlock code={scriptSnippet} />
      </Card>

      <Card title="Or install with npm" description="For React, Vue, Angular and other bundled apps.">
        <div className="space-y-3">
          <CopyBlock code="npm install @clicky/sdk" />
          <CopyBlock code={npmSnippet} />
        </div>
      </Card>
    </>
  );
}
