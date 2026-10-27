import { redirect } from "next/navigation";

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/overview`);
}
