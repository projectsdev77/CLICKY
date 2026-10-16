import { redirect } from "next/navigation";
import { canManage, requireActiveOrg } from "@/lib/dal";
import { NewProjectForm } from "./new-project-form";

export default async function NewProjectPage() {
  const { role } = await requireActiveOrg();
  if (!canManage(role)) redirect("/dashboard");
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold">New project</h1>
      <p className="mt-1 text-sm text-muted">Each project has its own install key, settings and analytics.</p>
      <div className="mt-6">
        <NewProjectForm />
      </div>
    </div>
  );
}
