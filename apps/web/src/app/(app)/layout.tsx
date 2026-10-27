import Link from "next/link";
import { listProjects, requireActiveOrg } from "@/lib/dal";
import { getBillingState } from "@/lib/billing";
import { signOut, switchOrganization } from "@/app/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, organization, memberships } = await requireActiveOrg();
  const [projects, billing] = await Promise.all([listProjects(organization.id), getBillingState(organization.id)]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-border bg-card p-4 md:w-60 md:border-b-0 md:border-r">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          clicky
        </Link>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Organization</p>
          <p className="truncate text-sm font-medium">{organization.name}</p>
          {memberships.length > 1 && (
            <div className="mt-1 space-y-0.5">
              {memberships
                .filter((m) => m.organization.id !== organization.id)
                .map((m) => (
                  <form key={m.organization.id} action={switchOrganization.bind(null, m.organization.id)}>
                    <button className="truncate text-xs text-muted hover:text-foreground">
                      Switch to {m.organization.name}
                    </button>
                  </form>
                ))}
            </div>
          )}
        </div>

        <nav className="space-y-1">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Projects</p>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}/install`}
              className="block truncate rounded px-2 py-1 text-sm hover:bg-background"
            >
              {p.name}
            </Link>
          ))}
          <Link href="/projects/new" className="block rounded px-2 py-1 text-sm text-muted hover:bg-background">
            + New project
          </Link>
        </nav>

        <nav className="space-y-1">
          <Link href="/team" className="block rounded px-2 py-1 text-sm hover:bg-background">
            Team
          </Link>
          <Link href="/billing" className="block rounded px-2 py-1 text-sm hover:bg-background">
            Billing <span className="text-xs text-muted">· {billing.plan.name}</span>
          </Link>
          {billing.status === "trialing" && billing.trialEndsAt && (
            <p className="px-2 text-xs text-muted">Trial ends {billing.trialEndsAt.toLocaleDateString()}</p>
          )}
          {billing.status === "trial_ended" && (
            <Link href="/billing" className="block px-2 text-xs text-brand-ink">
              Trial ended: upgrade
            </Link>
          )}
        </nav>

        <div className="mt-auto border-t border-border pt-4 text-sm">
          <p className="truncate text-muted">{user.email}</p>
          <form action={signOut}>
            <button className="mt-1 text-muted hover:text-foreground">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-10">{children}</main>
    </div>
  );
}
