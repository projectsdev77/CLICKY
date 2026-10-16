"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { project } from "@clicky/db";
import { defaultProjectSettings, generatePublicKey, normalizeOrigin } from "@clicky/shared";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManage, listMemberships, requireActiveOrg, requireProject, requireUser } from "@/lib/dal";

export type ActionState = { error?: string; ok?: string } | null;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parses one-origin-per-line (or comma-separated) input. */
function parseOrigins(raw: string): { origins: string[]; invalid: string[] } {
  const entries = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const origins = new Set<string>();
  const invalid: string[] = [];
  for (const entry of entries) {
    const normalized = normalizeOrigin(entry);
    if (normalized) origins.add(normalized);
    else invalid.push(entry);
  }
  return { origins: [...origins], invalid };
}

async function insertProject(organizationId: string, name: string, origins: string[]) {
  const id = crypto.randomUUID();
  await db.insert(project).values({
    id,
    organizationId,
    name,
    publicKey: generatePublicKey(),
    allowedOrigins: origins,
    settings: defaultProjectSettings(),
  });
  return id;
}

export async function createWorkspace(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const orgName = text(formData, "organization");
  const projectName = text(formData, "project");
  const { origins, invalid } = parseOrigins(text(formData, "origin"));
  if (!orgName || !projectName) return { error: "Company and app name are required." };
  if (invalid.length) return { error: `Not a valid website address: ${invalid.join(", ")}` };

  const requestHeaders = await headers();
  const org = await auth.api.createOrganization({
    body: { name: orgName, slug: slugify(orgName) },
    headers: requestHeaders,
  });
  if (!org) return { error: "Could not create the organization." };
  await auth.api.setActiveOrganization({ body: { organizationId: org.id }, headers: requestHeaders });
  const projectId = await insertProject(org.id, projectName, origins);
  redirect(`/projects/${projectId}/install`);
}

export async function createProject(_: ActionState, formData: FormData): Promise<ActionState> {
  const { organization, role } = await requireActiveOrg();
  if (!canManage(role)) return { error: "Only owners and admins can create projects." };
  const name = text(formData, "name");
  const { origins, invalid } = parseOrigins(text(formData, "origin"));
  if (!name) return { error: "Name is required." };
  if (invalid.length) return { error: `Not a valid website address: ${invalid.join(", ")}` };
  const projectId = await insertProject(organization.id, name, origins);
  redirect(`/projects/${projectId}/install`);
}

export async function updateOrigins(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireProject(projectId, { manage: true });
  const { origins, invalid } = parseOrigins(text(formData, "origins"));
  if (invalid.length) return { error: `Not a valid website address: ${invalid.join(", ")}` };
  await db.update(project).set({ allowedOrigins: origins }).where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: origins.length ? "Saved." : "Saved. Add at least one website so Clicky can load." };
}

export async function renameProject(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireProject(projectId, { manage: true });
  const name = text(formData, "name");
  if (!name) return { error: "Name is required." };
  await db.update(project).set({ name }).where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "Saved." };
}

export async function rotateProjectKey(projectId: string): Promise<ActionState> {
  await requireProject(projectId, { manage: true });
  await db
    .update(project)
    .set({ publicKey: generatePublicKey(), lastSeenAt: null, lastSeenUrl: null })
    .where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "New key generated. Update the snippet in your app." };
}

export async function deleteProject(projectId: string) {
  await requireProject(projectId, { manage: true });
  await db.delete(project).where(eq(project.id, projectId));
  redirect("/dashboard");
}

export async function switchOrganization(organizationId: string) {
  const session = await requireUser();
  const memberships = await listMemberships(session.user.id);
  if (!memberships.some((m) => m.organization.id === organizationId)) return;
  await auth.api.setActiveOrganization({ body: { organizationId }, headers: await headers() });
  redirect("/dashboard");
}

export async function inviteMember(_: ActionState, formData: FormData): Promise<ActionState> {
  const { organization, role } = await requireActiveOrg();
  if (!canManage(role)) return { error: "Only owners and admins can invite people." };
  const email = text(formData, "email").toLowerCase();
  const inviteRole = text(formData, "role") === "admin" ? "admin" : "member";
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  try {
    await auth.api.createInvitation({
      body: { email, role: inviteRole, organizationId: organization.id },
      headers: await headers(),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not send the invitation." };
  }
  revalidatePath("/team");
  return { ok: `Invitation sent to ${email}.` };
}

export async function cancelInvitation(invitationId: string) {
  await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
  revalidatePath("/team");
}

export async function acceptInvitation(invitationId: string): Promise<ActionState> {
  await requireUser();
  const requestHeaders = await headers();
  try {
    const result = await auth.api.acceptInvitation({ body: { invitationId }, headers: requestHeaders });
    const organizationId = result?.invitation.organizationId;
    if (organizationId) {
      await auth.api.setActiveOrganization({ body: { organizationId }, headers: requestHeaders });
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not accept the invitation." };
  }
  redirect("/dashboard");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
