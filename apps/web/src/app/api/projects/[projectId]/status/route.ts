import { NextResponse } from "next/server";
import { requireProject } from "@/lib/dal";

export async function GET(_: Request, { params }: RouteContext<"/api/projects/[projectId]/status">) {
  const { projectId } = await params;
  const { project } = await requireProject(projectId);
  return NextResponse.json({
    lastSeenAt: project.lastSeenAt?.toISOString() ?? null,
    lastSeenUrl: project.lastSeenUrl,
  });
}
