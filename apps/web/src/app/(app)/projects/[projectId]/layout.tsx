import Link from "next/link";
import { requireProject } from "@/lib/dal";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId);
  const tabs = [
    { href: `/projects/${project.id}/overview`, label: "Overview" },
    { href: `/projects/${project.id}/conversations`, label: "Conversations" },
    { href: `/projects/${project.id}/friction`, label: "Friction" },
    { href: `/projects/${project.id}/activity`, label: "Activity" },
    { href: `/projects/${project.id}/knowledge`, label: "Knowledge" },
    { href: `/projects/${project.id}/workflows`, label: "Workflows" },
    { href: `/projects/${project.id}/onboarding`, label: "Onboarding" },
    { href: `/projects/${project.id}/install`, label: "Install" },
    { href: `/projects/${project.id}/settings`, label: "Settings" },
  ];
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <nav className="mt-4 flex gap-4 overflow-x-auto border-b border-border text-sm whitespace-nowrap">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className="-mb-px border-b-2 border-transparent pb-2 hover:border-brand">
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}
