import type { ReactNode } from "react";

/** Long-form page wrapper with readable typography (no plugin needed). */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-16 text-[15px] leading-7 [&_code]:rounded [&_code]:bg-card [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px] [&_h1]:text-4xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-12 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-card [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-b [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_ul]:mt-3">
      {children}
    </article>
  );
}

export function DraftNotice() {
  return (
    <p className="!mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      Draft for review by counsel before launch. Not yet legally binding.
    </p>
  );
}
