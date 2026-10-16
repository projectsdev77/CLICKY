import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-24">
      <p className="text-sm font-medium text-brand">clicky</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
        An AI buddy that lives inside your product.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted">
        Your users ask out loud. Clicky sees the page, talks them through it, points at the right button, or just does
        it for them. You see exactly where they get stuck.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/sign-up" className="rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white">
          Get started
        </Link>
        <Link href="/sign-in" className="rounded-md border border-border px-4 py-2.5 text-sm font-medium">
          Sign in
        </Link>
      </div>
    </main>
  );
}
