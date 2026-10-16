import { canManage, requireProject } from "@/lib/dal";
import { Card } from "@/components/ui";
import { CopyBlock } from "@/components/copy-block";
import { DangerZone, RenameForm } from "./settings-forms";

export default async function SettingsPage({ params }: PageProps<"/projects/[projectId]/settings">) {
  const { projectId } = await params;
  const { project, role } = await requireProject(projectId);
  const manage = canManage(role);

  return (
    <>
      <Card title="General">
        <RenameForm projectId={project.id} name={project.name} disabled={!manage} />
      </Card>
      <Card
        title="Project key"
        description="Public by design. It only works on the websites you've allowed."
      >
        <CopyBlock code={project.publicKey} />
      </Card>
      {manage && (
        <Card title="Danger zone">
          <DangerZone projectId={project.id} />
        </Card>
      )}
    </>
  );
}
