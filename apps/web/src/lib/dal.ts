import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { member, organization, project } from "@clicky/db";
import { auth } from "./auth";
import { db } from "./db";

export type Role = "owner" | "admin" | "member";

export function canManage(role: Role) {
  return role === "owner" || role === "admin";
}

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export const listMemberships = cache(async (userId: string) =>
  db
    .select({ organization, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt)),
);

/** The org the user is working in: the session's active org if still a member, else their first. */
export async function requireActiveOrg() {
  const session = await requireUser();
  const memberships = await listMemberships(session.user.id);
  if (memberships.length === 0) redirect("/onboarding");
  const active =
    memberships.find((m) => m.organization.id === session.session.activeOrganizationId) ?? memberships[0]!;
  return { ...session, organization: active.organization, role: active.role as Role, memberships };
}

export const listProjects = cache(async (organizationId: string) =>
  db.select().from(project).where(eq(project.organizationId, organizationId)).orderBy(asc(project.createdAt)),
);

/** Loads a project the current user can access. Unknown or foreign projects 404 rather than leak existence. */
export async function requireProject(projectId: string, opts: { manage?: boolean } = {}) {
  const session = await requireUser();
  const [row] = await db
    .select({ project, role: member.role })
    .from(project)
    .innerJoin(
      member,
      and(eq(member.organizationId, project.organizationId), eq(member.userId, session.user.id)),
    )
    .where(eq(project.id, projectId))
    .limit(1);
  if (!row) notFound();
  const role = row.role as Role;
  if (opts.manage && !canManage(role)) notFound();
  return { ...session, project: row.project, role };
}
