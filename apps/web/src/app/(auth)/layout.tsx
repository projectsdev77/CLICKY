import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/dal";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
        clicky
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6">{children}</div>
    </main>
  );
}
