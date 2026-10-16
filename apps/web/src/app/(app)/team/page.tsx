import { and, asc, eq } from "drizzle-orm";
import { invitation, member, user } from "@clicky/db";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canManage, requireActiveOrg } from "@/lib/dal";
import { cancelInvitation } from "@/app/actions";
import { Card } from "@/components/ui";
import { InviteForm } from "./invite-form";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Viewer" };

export default async function TeamPage() {
  const { organization, role } = await requireActiveOrg();
  const manage = canManage(role);
  const [members, invitations] = await Promise.all([
    db
      .select({ id: member.id, role: member.role, name: user.name, email: user.email })
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

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Team</h1>
      <Card title="Members">
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                {m.name} <span className="text-muted">· {m.email}</span>
              </span>
              <span className="text-muted">{ROLE_LABEL[m.role] ?? m.role}</span>
            </li>
          ))}
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
    </div>
  );
}
