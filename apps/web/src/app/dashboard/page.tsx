import { redirect } from "next/navigation";
import { listProjects, requireActiveOrg } from "@/lib/dal";

export default async function DashboardPage() {
  const { organization } = await requireActiveOrg();
  const [first] = await listProjects(organization.id);
  redirect(first ? `/projects/${first.id}/install` : "/projects/new");
}
