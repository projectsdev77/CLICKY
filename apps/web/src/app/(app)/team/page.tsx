import { and, asc, eq, invitation, member, user } from "@clicky/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canManage, requireActiveOrg } from "@/lib/dal";
import { cancelInvitation, changeMemberRole, removeMember } from "@/app/actions";
import { Card } from "@/components/ui";
import { InviteForm } from "./invite-form";
import { DeleteOrganizationForm, LeaveButton, RenameOrganizationForm } from "./team-forms";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Viewer" };

export default async function TeamPage() {
  const { organization, role, user: me } = await requireActiveOrg();
  const manage = canManage(role);
  const [members, invitations] = await Promise.all([
    db
      .select({ id: member.id, role: member.role, userId: member.userId, name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, organization.id))
      .orderBy(asc(member.createdAt)),
    db
      .select()
      .from(invitation)
      .where(and(eq(invitation.organizationId, organization.id), eq(invitation.status, "pending")))
      .orderBy(asc(invitation.createdAt)),
  ]);
  const roles = role === "owner" ? ["owner", "admin", "member"] : ["admin", "member"];

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Team</h1>
      <Card title="Organization">
        <RenameOrganizationForm name={organization.name} disabled={!manage} />
      </Card>
      <Card title="Members">
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const self = m.userId === me.id;
            const editable = manage && !self && (role === "owner" || m.role !== "owner");
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {m.name} <span className="text-muted">· {m.email}</span>
                  {self && <span className="text-muted"> (you)</span>}
                </span>
                {editable ? (
                  <span className="flex items-center gap-3">
                    <form action={changeMemberRole.bind(null, m.id)} className="flex items-center gap-2">
                      <select
                        name="role"
                        defaultValue={m.role}
                        aria-label={`Role for ${m.name}`}
                        className="rounded-md border border-border bg-card px-2 py-1 text-sm"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <button className="text-xs text-brand-ink">Save</button>
                    </form>
                    <form action={removeMember.bind(null, m.id)}>
                      <button className="text-xs text-muted hover:text-red-600">Remove</button>
                    </form>
                  </span>
                ) : (
                  <span className="text-muted">{ROLE_LABEL[m.role] ?? m.role}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {manage && (
        <Card title="Invite people" description="Admins can change settings. Viewers can see analytics.">
          <InviteForm />
          {invitations.length > 0 && (
            <ul className="mt-6 divide-y divide-border border-t border-border">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {inv.email} <span className="text-muted">· {ROLE_LABEL[inv.role ?? "member"]} · pending</span>
                    <span className="block font-mono text-xs text-muted">{`${env.APP_URL}/invite/${inv.id}`}</span>
                  </span>
                  <form action={cancelInvitation.bind(null, inv.id)}>
                    <button className="text-xs text-muted hover:text-red-600">Cancel</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title="Leave or delete">
        <div className="space-y-6">
          <LeaveButton />
          {role === "owner" && <DeleteOrganizationForm name={organization.name} />}
        </div>
      </Card>
    </div>
  );
}
