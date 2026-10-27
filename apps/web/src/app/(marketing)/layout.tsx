import Link from "next/link";
import { getSession } from "@/lib/dal";

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-6 px-4 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            clicky
          </Link>
          <nav className="flex flex-1 gap-5 text-sm text-muted">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/docs" className="hover:text-foreground">
              Docs
            </Link>
            <Link href="/security" className="hover:text-foreground">
              Security
            </Link>
          </nav>
          {session ? (
            <Link href="/dashboard" className="rounded-md bg-brand px-3.5 py-2 text-sm font-medium text-white">
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-4 text-sm">
              <Link href="/sign-in" className="text-muted hover:text-foreground">
                Sign in
              </Link>
              <Link href="/sign-up" className="rounded-md bg-brand px-3.5 py-2 font-medium text-white">
                Start free trial
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap justify-between gap-4 px-4 py-8 text-sm text-muted">
          <span>© {new Date().getFullYear()} Clicky</span>
          <nav className="flex gap-5">
            <Link href="/docs">Docs</Link>
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
