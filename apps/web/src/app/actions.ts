"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, eq, knowledgeSource, project } from "@clicky/db";
import { defaultProjectSettings, generatePublicKey, normalizeOrigin, parseProjectSettings, projectSettingsSchema } from "@clicky/shared";
import { auth } from "@/lib/auth";
import { saveTextSource, syncUrlSource } from "@/lib/knowledge";
import { getBillingState, startTrial } from "@/lib/billing";
import { deleteEndUserData } from "@/lib/retention";
import { buildDigest } from "@/lib/digest";
import { sendEmail } from "@/lib/email";
import { db } from "@/lib/db";
import { canManage, listMemberships, requireActiveOrg, requireProject, requireUser } from "@/lib/dal";

export type ActionState = { error?: string; ok?: string } | null;

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Accepts "support@acme.com", "mailto:…" or "https://…". */
function normalizeHandoffUrl(value: string) {
  if (!value) return "";
  if (/^[^@\s:/]+@[^@\s]+\.[^@\s]+$/.test(value)) return `mailto:${value}`;
  return value;
}

function lines(value: string) {
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
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
  await startTrial(org.id);
  await auth.api.setActiveOrganization({ body: { organizationId: org.id }, headers: requestHeaders });
  const projectId = await insertProject(org.id, projectName, origins);
  redirect(`/projects/${projectId}/install`);
}

export async function createProject(_: ActionState, formData: FormData): Promise<ActionState> {
  const { organization, role } = await requireActiveOrg();
  if (!canManage(role)) return { error: "Only owners and admins can create projects." };
  const billing = await getBillingState(organization.id);
  if (billing.usage.projects >= billing.plan.limits.projects) {
    return { error: `Your ${billing.plan.name} plan includes ${billing.plan.limits.projects} project${billing.plan.limits.projects === 1 ? "" : "s"}. Upgrade on the Billing page to add more.` };
  }
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

export async function updateAssistantSettings(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { project: proj } = await requireProject(projectId, { manage: true });
  const current = parseProjectSettings(proj.settings);
  const parsed = projectSettingsSchema.safeParse({
    ...current,
    appearance: {
      ...current.appearance,
      assistantName: text(formData, "assistantName"),
      greeting: text(formData, "greeting"),
      brandColor: text(formData, "brandColor"),
      position: text(formData, "position"),
      theme: text(formData, "theme"),
    },
    behavior: {
      ...current.behavior,
      mode: text(formData, "mode"),
      voiceEnabled: formData.get("voiceEnabled") === "on",
      trackSignals: formData.get("trackSignals") === "on",
      customInstructions: text(formData, "customInstructions"),
      blockedPaths: lines(text(formData, "blockedPaths")),
      confirmKeywords: lines(text(formData, "confirmKeywords")),
    },
    data: {
      ...current.data,
      retentionDays: Number(text(formData, "retentionDays")) || current.data.retentionDays,
      weeklyDigest: formData.get("weeklyDigest") === "on",
    },
    proactive: {
      enabled: formData.get("proactiveEnabled") === "on",
      stuckSeconds: Number(text(formData, "stuckSeconds")) || current.proactive.stuckSeconds,
    },
    handoff: {
      url: normalizeHandoffUrl(text(formData, "handoffUrl")),
      label: text(formData, "handoffLabel") || current.handoff.label,
    },
  });
  if (!parsed.success) {
    return { error: "Some values aren't valid. Check the name, color, support link (https:// or an email) and instructions." };
  }
  await db.update(project).set({ settings: parsed.data }).where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: "Saved. Changes show up next time the page with Clicky loads." };
}

export async function addUrlSource(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireProject(projectId, { manage: true });
  let url: URL;
  try {
    url = new URL(text(formData, "url"));
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return { error: "Enter a full web address, like https://help.acme.com/" };
  }
  const id = crypto.randomUUID();
  await db.insert(knowledgeSource).values({ id, projectId, type: "url", url: url.toString(), title: url.host });
  after(() => syncUrlSource(id));
  revalidatePath(`/projects/${projectId}/knowledge`);
  return { ok: "Reading your help center. This usually takes under a minute." };
}

export async function addTextSource(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireProject(projectId, { manage: true });
  const title = text(formData, "title");
  const body = text(formData, "body");
  if (!title || body.length < 20) return { error: "Add a title and at least a sentence or two." };
  if (body.length > 200_000) return { error: "That's too long. Split it into a few smaller articles." };
  const id = crypto.randomUUID();
  await db.insert(knowledgeSource).values({ id, projectId, type: "text", title, status: "syncing" });
  await saveTextSource(id, projectId, title, body);
  revalidatePath(`/projects/${projectId}/knowledge`);
  return { ok: "Added." };
}

export async function resyncSource(projectId: string, sourceId: string) {
  await requireProject(projectId, { manage: true });
  const [source] = await db
    .select()
    .from(knowledgeSource)
    .where(and(eq(knowledgeSource.id, sourceId), eq(knowledgeSource.projectId, projectId)));
  if (source?.type !== "url") return;
  await db.update(knowledgeSource).set({ status: "pending" }).where(eq(knowledgeSource.id, sourceId));
  after(() => syncUrlSource(sourceId));
  revalidatePath(`/projects/${projectId}/knowledge`);
}

export async function deleteSource(projectId: string, sourceId: string) {
  await requireProject(projectId, { manage: true });
  await db
    .delete(knowledgeSource)
    .where(and(eq(knowledgeSource.id, sourceId), eq(knowledgeSource.projectId, projectId)));
  revalidatePath(`/projects/${projectId}/knowledge`);
}

export async function deleteUserData(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  await requireProject(projectId, { manage: true });
  const userId = text(formData, "userId");
  if (!userId) return { error: "Enter the user id your app passes to Clicky.identify()." };
  const deleted = await deleteEndUserData(projectId, userId);
  revalidatePath(`/projects/${projectId}`, "layout");
  return deleted
    ? { ok: `Deleted everything Clicky had for ${userId}.` }
    : { error: `No data found for ${userId}. (Anonymous visitors can't be looked up by id.)` };
}

export async function saveWorkflow(projectId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const { project: proj } = await requireProject(projectId, { manage: true });
  const settings = parseProjectSettings(proj.settings);
  const id = text(formData, "id") || crypto.randomUUID().slice(0, 8);
  const workflow = { id, name: text(formData, "name"), instructions: text(formData, "instructions") };
  if (!workflow.name || !workflow.instructions) return { error: "Give the workflow a name and some steps." };
  const others = settings.workflows.filter((w) => w.id !== id);
  if (others.length >= 30) return { error: "You can have up to 30 workflows." };
  const parsed = projectSettingsSchema.safeParse({ ...settings, workflows: [...others, workflow] });
  if (!parsed.success) return { error: "That's too long. Keep the name under 80 characters and the steps under 3,000." };
  await db.update(project).set({ settings: parsed.data }).where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}/workflows`);
  return { ok: "Saved. Clicky will follow it from the next conversation." };
}

export async function deleteWorkflow(projectId: string, workflowId: string) {
  const { project: proj } = await requireProject(projectId, { manage: true });
  const settings = parseProjectSettings(proj.settings);
  const updated = { ...settings, workflows: settings.workflows.filter((w) => w.id !== workflowId) };
  await db.update(project).set({ settings: updated }).where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}/workflows`);
}

async function updateOnboarding(
  projectId: string,
  change: (current: ReturnType<typeof parseProjectSettings>["onboarding"]) => ReturnType<typeof parseProjectSettings>["onboarding"],
): Promise<ActionState> {
  const { project: proj } = await requireProject(projectId, { manage: true });
  const settings = parseProjectSettings(proj.settings);
  const parsed = projectSettingsSchema.safeParse({ ...settings, onboarding: change(settings.onboarding) });
  if (!parsed.success) return { error: "Some values aren't valid (titles up to 80 characters, at most 10 steps)." };
  await db.update(project).set({ settings: parsed.data }).where(eq(project.id, projectId));
  revalidatePath(`/projects/${projectId}/onboarding`);
  return { ok: "Saved." };
}

export async function saveOnboardingSettings(projectId: string, _: ActionState, formData: FormData) {
  return updateOnboarding(projectId, (o) => ({
    ...o,
    enabled: formData.get("enabled") === "on",
    title: text(formData, "title") || o.title,
    audienceDays: Number(text(formData, "audienceDays")) || o.audienceDays,
  }));
}

export async function addOnboardingStep(projectId: string, _: ActionState, formData: FormData) {
  const type = text(formData, "type");
  return updateOnboarding(projectId, (o) => ({
    ...o,
    steps: [
      ...o.steps,
      {
        id: crypto.randomUUID().slice(0, 8),
        title: text(formData, "title"),
        doneWhen: { type: (type === "click" || type === "event" ? type : "page") as "page" | "click" | "event", value: text(formData, "value") },
      },
    ],
  }));
}

export async function removeOnboardingStep(projectId: string, stepId: string) {
  await updateOnboarding(projectId, (o) => ({ ...o, steps: o.steps.filter((s) => s.id !== stepId) }));
}

export async function moveOnboardingStep(projectId: string, stepId: string) {
  await updateOnboarding(projectId, (o) => {
    const steps = [...o.steps];
    const i = steps.findIndex((s) => s.id === stepId);
    if (i > 0) [steps[i - 1], steps[i]] = [steps[i]!, steps[i - 1]!];
    return { ...o, steps };
  });
}

export async function sendDigestPreview(projectId: string): Promise<ActionState> {
  const { user } = await requireProject(projectId);
  const digest = await buildDigest(projectId);
  if (!digest) return { error: "No conversations in the last 7 days, so there's nothing to summarise yet." };
  await sendEmail({ to: user.email, ...digest });
  return { ok: `Sent to ${user.email}.` };
}
