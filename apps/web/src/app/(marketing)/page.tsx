import Link from "next/link";

const FEATURES = [
  { title: "Talks and listens", body: "Users hold Alt+Space and ask out loud. Clicky answers in a natural voice, or in text if they prefer typing." },
  { title: "Points the way", body: "An animated pointer lands on the exact button or field Clicky is talking about, in time with what it says." },
  { title: "Does it for them", body: "Ask Clicky to export a report or change a setting and it does it in front of them, asking first before anything risky." },
  { title: "Teaches step by step", body: "Or it walks users through a task one step at a time and waits while they do each part themselves." },
  { title: "Knows your product", body: "Point Clicky at your help center and it answers from your docs, not guesses." },
  { title: "Shows where users struggle", body: "See what people ask, what Clicky couldn't answer, and which pages cause rage clicks and form errors." },
];

const FAQ = [
  {
    q: "How long does setup take?",
    a: "Paste one script tag (or install the npm package), add your website and help-center address in the dashboard, and you're live. Most teams are set up in minutes.",
  },
  {
    q: "Does it work with my framework?",
    a: "Yes. Clicky works with React, Vue, Angular, Svelte and plain HTML apps, including single-page apps. It runs in its own Shadow DOM, so it won't clash with your styles.",
  },
  {
    q: "What data leaves the browser?",
    a: "Only when someone asks Clicky something: a text description of the page they're on. Passwords, payment fields and anything you mark as private are masked before it's sent, and emails, phone and card numbers in page text are masked automatically. No screenshots, no session recordings, no audio stored.",
  },
  {
    q: "Could Clicky break something in my app?",
    a: "Clicky acts with the user's own permissions, shows every step, and asks before anything that deletes, pays, sends or can't be undone. You can block pages, add your own \"always ask\" words, or switch it to guide-only mode.",
  },
  {
    q: "Which browsers support voice?",
    a: "Voice works in Chrome, Edge, Safari and Firefox. Typing always works everywhere.",
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto grid w-full max-w-5xl items-center gap-12 px-4 py-20 md:grid-cols-2">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">An AI buddy that lives inside your product.</h1>
          <p className="mt-5 text-lg text-muted">
            Your users ask out loud. Clicky sees the page, talks them through it, points at the right button, or just does
            it for them. You see exactly where they get stuck.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="rounded-md bg-brand px-5 py-3 text-sm font-medium text-white">
              Start your 14-day free trial
            </Link>
            <Link href="/docs" className="rounded-md border border-border px-5 py-3 text-sm font-medium">
              See how it installs
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">No credit card needed.</p>
        </div>
        <ProductMock />
      </section>

      <section className="border-y border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 py-16">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              ["Add one line", "Paste the script tag into your app, or install @clicky/sdk."],
              ["Teach it your product", "Add your help center. Clicky reads it and the page your user is on."],
              ["Users just ask", "They hold Alt+Space and talk. Clicky answers, points, or does it for them."],
            ].map(([title, body], i) => (
              <li key={title}>
                <span className="text-sm font-medium text-brand-ink">Step {i + 1}</span>
                <h3 className="mt-1 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-16">
        <h2 className="text-2xl font-semibold">Help that does the work</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <h2 className="text-2xl font-semibold">Questions</h2>
        <dl className="mt-6 divide-y divide-border">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-2 text-sm text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
          <h2 className="text-2xl font-semibold">Give your users someone to ask.</h2>
          <Link href="/sign-up" className="mt-6 inline-block rounded-md bg-brand px-5 py-3 text-sm font-medium text-white">
            Start free trial
          </Link>
        </div>
      </section>
    </>
  );
}

/** An illustration of Clicky in an app: a page, a highlighted button, and the chat. */
function ProductMock() {
  return (
    <div aria-hidden="true" className="relative rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
      </div>
      <div className="mt-4 space-y-3">
        <div className="h-3 w-1/3 rounded bg-border" />
        <div className="flex items-center gap-2">
          <div className="h-7 w-20 rounded border border-border" />
          <div className="relative rounded-md border border-border px-3 py-1 text-xs ring-4 ring-brand/30 outline outline-2 outline-brand">
            Export
            <svg className="absolute -bottom-4 -right-3 h-6 w-6 text-brand-ink" viewBox="0 0 24 24">
              <path fill="currentColor" stroke="#fff" strokeWidth="1.5" d="M4 3l7.5 18 2.6-7.4L21.5 11z" />
            </svg>
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3 rounded bg-border/60" style={{ width: `${90 - i * 15}%` }} />
        ))}
      </div>
      <div className="ml-auto mt-6 w-64 space-y-2 rounded-lg border border-border bg-background p-3 text-xs">
        <p className="ml-auto w-fit rounded-xl bg-brand px-3 py-1.5 text-white">How do I export this as Excel?</p>
        <p className="w-fit rounded-xl bg-card px-3 py-1.5">Pick Excel in the format menu, then hit Export, right here.</p>
      </div>
    </div>
  );
}
