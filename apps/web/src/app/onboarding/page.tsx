import Link from "next/link";
import { redirect } from "next/navigation";
import { listMemberships, requireUser } from "@/lib/dal";
import { WorkspaceForm } from "./workspace-form";

export default async function OnboardingPage() {
  const session = await requireUser();
  if ((await listMemberships(session.user.id)).length > 0) redirect("/dashboard");
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold">Welcome to Clicky, {session.user.name.split(" ")[0]}</h1>
      <p className="mt-2 text-muted">Tell us about the app you want Clicky to live in. You can change all of this later.</p>
      <div className="mt-8">
        <WorkspaceForm />
      </div>
      <p className="mt-6 text-sm text-muted">
        Waiting for an invitation from your team? Ask them to send it to {session.user.email}. ·{" "}
        <Link href="/account" className="text-brand-ink underline">
          Account settings
        </Link>
      </p>
    </main>
  );
}
