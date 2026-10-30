import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { signOut } from "@/app/actions";

/** Account settings work with or without an organization (e.g. after leaving your last team). */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-4 text-sm">
          <Link href="/dashboard" className="text-xl font-bold tracking-tight">
            clicky
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-muted hover:text-foreground">
              Dashboard
            </Link>
            <form action={signOut}>
              <button className="text-muted hover:text-foreground">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
