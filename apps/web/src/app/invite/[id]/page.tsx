import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { invitation, organization } from "@clicky/db";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dal";
import { AcceptInvite } from "./accept-invite";

export default async function InvitePage({ params }: PageProps<"/invite/[id]">) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${id}`)}`);

  const [row] = await db
    .select({ invitation, organizationName: organization.name })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, id))
    .limit(1);

  const valid =
    row &&
    row.invitation.status === "pending" &&
    row.invitation.expiresAt > new Date() &&
    row.invitation.email.toLowerCase() === session.user.email.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-24 text-center">
      {valid ? (
        <>
          <h1 className="text-xl font-semibold">Join {row.organizationName} on Clicky</h1>
          <p className="mt-2 text-sm text-muted">You were invited as {row.invitation.role ?? "member"}.</p>
          <div className="mt-6">
            <AcceptInvite invitationId={id} />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold">This invitation isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-muted">
            It may have expired, been cancelled, or been sent to a different email than {session.user.email}.
          </p>
        </>
      )}
    </main>
  );
}
